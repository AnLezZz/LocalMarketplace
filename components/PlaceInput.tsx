"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../lib/convex";

type Option = { _id: string; name: string; kind: string; context: string; open: boolean };
const KIND: Record<string, string> = { region: "Region", territorial_authority: "Council area", subdivision: "Area", suburb: "Suburb", locality: "Locality" };
const canDrill = (o: Option) => o.kind === "region" || o.kind === "territorial_authority" || o.kind === "subdivision";
// Display only: drop a trailing "Subdivision" (kept in the data).
const shown = (n: string) => n.replace(/ Subdivision$/, "");
// What the select below a place is called: a region holds districts (council areas, or Auckland's local boards), a district holds suburbs.
const LEVEL: Record<string, string> = { region: "District", territorial_authority: "Suburb", subdivision: "Suburb" };

/**
 * Location picker as an ARIA combobox over every recognised NZ place.
 * Empty box: a Location panel with Region, District and Suburb selects that narrow step by step, each starting with "All of ...", each starting with "All of ...".
 * Typing: matching places with their council and region, so two Newtowns are told apart.
 * Submits the typed text as `name` and the picked place's ID as `idName`. Without JavaScript it is a plain text field the server resolves.
 */
export default function PlaceInput({ name, idName, defaultValue = "", defaultId = "", placeholder, label }: { name: string; idName: string; defaultValue?: string; defaultId?: string; placeholder: string; label: string }) {
  const [text, setText] = useState(defaultValue);
  const [id, setId] = useState(defaultId);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [trail, setTrail] = useState<Option[]>([]); // what is chosen so far in the panel, widest first
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(text.trim()), 150); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const typing = text.trim().length >= 2;
  const browsing = open && !id && !typing;
  const found = useQuery(api.locations.searchPlaces, open && !id && typing && debounced.length >= 2 ? { q: debounced } : "skip") as Option[] | undefined;
  const regions = (useQuery(api.locations.regions, browsing ? {} : "skip") as Option[] | undefined) ?? [];
  // Fixed number of hooks: two levels sit below the region.
  const below = (i: number) => (useQuery(api.locations.children, browsing && trail[i] && canDrill(trail[i]) ? { parentId: trail[i]._id } : "skip") as Option[] | undefined) ?? [];
  const levels = [below(0), below(1)];
  const options: Option[] = typing ? found ?? [] : [];
  const loading = typing && found === undefined;
  const show = browsing || (open && !id && typing && debounced.length >= 2);

  function pick(o: Option) { setText(shown(o.name)); setId(o._id); setOpen(false); setActive(-1); setTrail([]); }
  function clear() { setText(""); setId(""); setOpen(false); setActive(-1); setTrail([]); }
  const choose = (level: number, list: Option[], value: string) => setTrail((t) => { const o = list.find((x) => x._id === value); return o ? [...t.slice(0, level), o] : t.slice(0, level); });
  function apply() { const best = trail[trail.length - 1]; if (best) pick(best); else clear(); }
  function onKey(e: React.KeyboardEvent) {
    const o = options[active];
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && show && o) { e.preventDefault(); pick(o); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="placein" ref={root}>
      <input
        name={name} value={text} placeholder={placeholder} aria-label={label} autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={show} aria-controls={browsing ? undefined : listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { setText(e.target.value); setId(""); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onKeyDown={onKey}
      />
      <input type="hidden" name={idName} value={id} />
      <div className="sr-only" role="status" aria-live="polite">{show && !browsing && !loading ? `${options.length} places` : ""}</div>
      {browsing && (
        <div className="placein__list placein__panel" role="dialog" aria-label={label}>
          <h2 className="placein__title">Location</h2>
          <label className="placein__sel"><span>Region</span>
            <select value={trail[0]?._id ?? ""} onChange={(e) => choose(0, regions, e.target.value)}>
              <option value="">All of New Zealand</option>
              {regions.map((o) => <option key={o._id} value={o._id}>{o.name}{!o.open ? " (not launched yet)" : ""}</option>)}
            </select></label>
          {levels.map((list, i) => trail[i] && canDrill(trail[i]) && (
            <label key={trail[i]._id} className="placein__sel"><span>{LEVEL[trail[i].kind]}</span>
              <select value={trail[i + 1]?._id ?? ""} onChange={(e) => choose(i + 1, list, e.target.value)}>
                <option value="">All of {shown(trail[i].name)}</option>
                {list.map((o) => <option key={o._id} value={o._id}>{shown(o.name)}{!o.open ? " (not launched yet)" : ""}</option>)}
              </select></label>
          ))}
          <button type="button" className="btn btn--forest placein__apply" onClick={apply}>Apply</button>
        </div>
      )}
      {!browsing && show && (
        <ul className="placein__list" id={listId} role="listbox" aria-label={label}>
          {loading && <li className="placein__note">Loading...</li>}
          {!loading && options.length === 0 && <li className="placein__note">No New Zealand place matches &ldquo;{debounced}&rdquo;</li>}
          {options.map((o, i) => (
            <li key={o._id} className="placein__row">
              <div id={`${listId}-${i}`} role="option" aria-selected={i === active} className="placein__opt" onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}>
                <span className="placein__name">{shown(o.name)}</span>
                <span className="placein__ctx">{KIND[o.kind] ?? o.kind}{o.context && !canDrill(o) ? ` · ${o.context}` : ""}{!o.open && " · not launched yet"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

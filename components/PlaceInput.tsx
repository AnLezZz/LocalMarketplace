"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "../lib/convex";

type Option = { _id: string; name: string; kind: string; context: string; open: boolean };
const KIND: Record<string, string> = { region: "Region", territorial_authority: "District", subdivision: "District", suburb: "Suburb", locality: "Locality" };
// The pickers offer regions and districts only (a district is a council area, or one of Auckland's local boards).
const PICKABLE = ["region", "territorial_authority", "subdivision"];
const canDrill = (o: Option) => o.kind === "region";
// Display only: drop a trailing "Subdivision" (kept in the data).
const shown = (n: string) => n.replace(/ Subdivision$/, "");

/**
 * Location picker as an ARIA combobox over every recognised NZ place.
 * Empty box: a Location panel with a Region select and then a District select (each starting with "All of ..."). On a phone it is a bottom sheet.
 * Typing: matching regions and districts. There is no suburb level: places are picked as a region or a district.
 * Submits the typed text as `name` and the picked place's ID as `idName`. Without JavaScript it is a plain text field the server resolves.
 * `submitOnPick`: choosing a place (an option, or Apply in the panel) submits the surrounding form, so adding a place is one step.
 */
export default function PlaceInput({ name, idName, defaultValue = "", defaultId = "", placeholder, label, id: inputId, submitOnPick = false }: { name: string; idName: string; defaultValue?: string; defaultId?: string; placeholder: string; label: string; id?: string; submitOnPick?: boolean }) {
  const [text, setText] = useState(defaultValue);
  const [id, setId] = useState(defaultId);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [trail, setTrail] = useState<Option[]>([]); // what is chosen so far in the panel, widest first
  const [up, setUp] = useState(false); // open the panel upward when there is no room below
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false); // the user has typed their own text, so show matches instead of the panel
  const [touched, setTouched] = useState(false); // the panel selects were changed since it opened
  const skipFocus = useRef(false); // closing hands focus back to the field without reopening the panel
  const [submitNext, setSubmitNext] = useState(false);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false); // on phones the panel is a bottom sheet rendered on <body>, above the tab bar and clear of any stacking context
  const inside = (n: Node | null) => !!n && (root.current?.contains(n) || panelRef.current?.contains(n));

  useEffect(() => { const t = setTimeout(() => setDebounced(text.trim()), 150); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!inside(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  // The hidden ID is committed in this render before the form is submitted.
  useEffect(() => {
    if (!submitNext || !id) return;
    setSubmitNext(false);
    root.current?.closest("form")?.requestSubmit();
  }, [submitNext, id]);

  // Opened on a page that already has a place chosen: start the panel on that region and district.
  const initial = useQuery(api.locations.trailOf, defaultId ? { placeId: defaultId } : "skip") as Option[] | undefined;
  useEffect(() => { if (initial && initial.length > 0) setTrail((t) => (t.length === 0 ? initial : t)); }, [initial]);

  // A chosen place can always be changed: the panel reopens with the previous selection until the user types something new.
  const typing = dirty && text.trim().length >= 2;
  const browsing = open && !dirty;
  const found = useQuery(api.locations.searchPlaces, open && typing && debounced.length >= 2 ? { q: debounced, kinds: PICKABLE } : "skip") as Option[] | undefined;
  const regions = (useQuery(api.locations.regions, browsing ? {} : "skip") as Option[] | undefined) ?? [];
  const districts = (useQuery(api.locations.children, browsing && trail[0] ? { parentId: trail[0]._id, kinds: ["territorial_authority", "subdivision"] } : "skip") as Option[] | undefined) ?? [];
  const options: Option[] = typing ? found ?? [] : [];
  const loading = typing && found === undefined;
  const show = browsing || (open && typing && debounced.length >= 2);
  useEffect(() => {
    if (!show || !root.current) return;
    const r = root.current.getBoundingClientRect();
    setUp(window.innerWidth > 640 && window.innerHeight - r.bottom < 420 && r.top > 420);
    setSheet(window.innerWidth <= 640);
  }, [show]);

  function pick(o: Option) { setText(shown(o.name)); setId(o._id); setDirty(false); setTouched(false); setOpen(false); setActive(-1); setNote(""); if (submitOnPick) setSubmitNext(true); }
  function clear() { setText(""); setId(""); setDirty(false); setTouched(false); setOpen(false); setActive(-1); setTrail([]); setNote(""); }
  function close() { skipFocus.current = true; setOpen(false); field.current?.focus(); setTimeout(() => { skipFocus.current = false; }, 0); }
  const choose = (level: number, list: Option[], value: string) => { setTouched(true); setTrail((t) => { const o = list.find((x) => x._id === value); return o ? [...t.slice(0, level), o] : t.slice(0, level); }); };
  function apply() {
    const best = trail[trail.length - 1];
    if (best) pick(best);
    else if (id && !touched) setOpen(false); // nothing was changed: keep the current place
    else if (submitOnPick) setNote("Choose a region first.");
    else clear();
  }
  function onKey(e: React.KeyboardEvent) {
    const o = options[active];
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && show && o) { e.preventDefault(); pick(o); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
  }

  const panel = browsing ? (
    <>

          <div className="placein__scrim" onMouseDown={() => setOpen(false)} aria-hidden="true" />
          <div ref={panelRef} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }} className={`placein__list placein__panel${up ? " placein__list--up" : ""}`} id={listId} role="dialog" aria-label={label}>
            <div className="placein__head2">
              <h2 className="placein__title">Location</h2>
              <button type="button" className="placein__close" onClick={close} aria-label="Close location picker">×</button>
            </div>
            <div className="placein__body">
              <label className="placein__sel"><span>Region</span>
                <select value={trail[0]?._id ?? ""} onChange={(e) => { setNote(""); choose(0, regions, e.target.value); }}>
                  <option value="">All of New Zealand</option>
                  {regions.map((o) => <option key={o._id} value={o._id}>{o.name}{!o.open ? " (not launched yet)" : ""}</option>)}
                </select></label>
              {trail[0] && (
                <label className="placein__sel"><span>District</span>
                  <select value={trail[1]?._id ?? ""} onChange={(e) => choose(1, districts, e.target.value)}>
                    <option value="">All of {shown(trail[0].name)}</option>
                    {districts.map((o) => <option key={o._id} value={o._id}>{shown(o.name)}{!o.open ? " (not launched yet)" : ""}</option>)}
                  </select></label>
              )}
            </div>
            <div className="placein__foot">
              {note && <p className="placein__alert" role="alert">{note}</p>}
              <button type="button" className="btn btn--forest placein__apply" onClick={apply}>{submitOnPick ? "Add this place" : "Apply"}</button>
            </div>
          </div>
    </>
  ) : null;

  return (
    <div className="placein" ref={root}
      onKeyDown={(e) => { if (e.key === "Escape" && browsing) { e.stopPropagation(); close(); } }}
      onBlur={(e) => { if (e.relatedTarget && !inside(e.relatedTarget as Node)) setOpen(false); }}>
      <input
        ref={field} id={inputId} name={name} value={text} placeholder={placeholder} aria-label={label} autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={show} aria-haspopup={browsing ? "dialog" : "listbox"} aria-controls={show ? listId : undefined} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { setText(e.target.value); setId(""); setDirty(e.target.value.trim().length > 0); setOpen(true); setActive(-1); }}
        onFocus={() => { if (skipFocus.current) { skipFocus.current = false; return; } setOpen(true); }} onClick={() => setOpen(true)} onKeyDown={onKey}
      />
      <input type="hidden" name={idName} value={id} />
      <div className="sr-only" role="status" aria-live="polite">{show && !browsing && !loading ? `${options.length} places` : ""}</div>
      {panel && (sheet ? createPortal(panel, document.body) : panel)}
      {!browsing && show && (
        <ul className={`placein__list${up ? " placein__list--up" : ""}`} id={listId} role="listbox" aria-label={label}>
          {loading && <li className="placein__note">Loading...</li>}
          {!loading && options.length === 0 && <li className="placein__note">No New Zealand place matches &ldquo;{debounced}&rdquo;</li>}
          {options.map((o, i) => (
            <li key={o._id} className="placein__row">
              <div id={`${listId}-${i}`} role="option" aria-selected={i === active} className="placein__opt" onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}>
                <span className="placein__name">{shown(o.name)}</span>
                <span className="placein__ctx">{KIND[o.kind] ?? o.kind}{o.context && o.kind !== "region" ? ` · ${o.context}` : ""}{!o.open && " · not launched yet"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

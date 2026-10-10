import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { addPopularSuburbs, addSuburbs, dismissLocationReview, removeSuburb, resolveLocationReview, saveCity, setAreaOpen, setSuburbEnabled } from "../actions";

export const dynamic = "force-dynamic";
type Row = { _id: string; name: string; enabled: boolean };

export default async function AdminLocations({ searchParams }: { searchParams: Promise<{ q?: string; err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { q, err, ok } = await searchParams;
  const opts = await authOpts();
  const cov = (await fetchQuery(api.locations.adminCoverage, {}, opts)) as { imported: boolean; regions: { _id: string; name: string; open: boolean }[]; closed: { _id: string; name: string; kind: string; context: string }[] };
  if (cov.imported) return <Coverage cov={cov} q={q} err={err} ok={ok} />;
  const data = (await fetchQuery(api.locations.adminList, {}, await authOpts())) as { city: string; suburbs: Row[] };
  const shown = q ? data.suburbs.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())) : data.suburbs;
  const enabled = data.suburbs.filter((s) => s.enabled).length;
  const back = `/admin/locations${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  return (
    <AdminShell active="locations" title="Locations" sub="Where Localo operates. Once any suburb is listed, bookings, provider profiles and service areas can only use enabled suburbs. With none listed there is no restriction." err={err} ok={ok}>
      <section className="card d-card" aria-labelledby="city-h">
        <div className="d-card__head"><h2 id="city-h" className="d-card__title">Launch city</h2></div>
        <form action={saveCity} className="adm-act"><input type="hidden" name="back" value={back} />
          <input name="city" defaultValue={data.city} required maxLength={60} aria-label="City name" /><button className="btn btn--secondary btn--sm">Save city</button></form>
        <p className="field__hint">Shown next to suburbs across the site.</p>
      </section>

      <section className="card d-card" aria-labelledby="sub-h">
        <div className="d-card__head"><h2 id="sub-h" className="d-card__title">Supported suburbs</h2><span className="d-card__sub num">{enabled} enabled of {data.suburbs.length}</span></div>
        {data.suburbs.length === 0 && <p className="field__hint">No suburbs listed, so customers and providers can use any suburb. Add some to start limiting where Localo operates.</p>}
        <form action={addSuburbs} className="form"><input type="hidden" name="back" value={back} />
          <div className="field"><label htmlFor="names" className="field__label">Add suburbs (one per line or comma separated)</label>
            <textarea id="names" name="names" rows={3} placeholder="Ponsonby, Grey Lynn, Mount Eden" required /></div>
          <div className="adm-act"><button className="btn btn--primary btn--sm">Add suburbs</button></div>
        </form>
        <form action={addPopularSuburbs} className="adm-act"><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">Add popular Auckland suburbs</button><span className="field__hint">Adds about 50 and skips any already listed.</span></form>

        {data.suburbs.length > 0 && (
          <>
            <form className="adm-search" role="search"><input name="q" defaultValue={q} placeholder="Search suburbs" aria-label="Search suburbs" /><button className="btn btn--secondary btn--sm">Search</button>{q && <Link href="/admin/locations" className="lp-link">Clear</Link>}</form>
            <ul className="adm-list">
              {shown.map((s) => (
                <li key={s._id} className="adm-row">
                  <div className="adm-row__main"><strong>{s.name} <span className={`pill pill--${s.enabled ? "completed" : "neutral"}`}>{s.enabled ? "Enabled" : "Disabled"}</span></strong></div>
                  <div className="adm-act">
                    <form action={setSuburbEnabled.bind(null, s._id, !s.enabled)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">{s.enabled ? "Disable" : "Enable"}</button></form>
                    <form action={removeSuburb.bind(null, s._id)}><input type="hidden" name="back" value={back} /><button className="btn btn--danger btn--sm" aria-label={`Remove ${s.name}`}>Remove</button></form>
                  </div>
                </li>
              ))}
            </ul>
            {shown.length === 0 && <p className="field__hint">No suburbs match.</p>}
          </>
        )}
      </section>
    </AdminShell>
  );
}

type Place = { _id: string; name: string; kind: string; context: string; open: boolean };
async function Coverage({ cov, q, err, ok }: { cov: { regions: { _id: string; name: string; open: boolean }[]; closed: { _id: string; name: string; kind: string; context: string }[] }; q?: string; err?: string; ok?: string }) {
  const opts = await authOpts();
  const found = q ? ((await fetchQuery(api.locations.searchPlaces, { q, limit: 25 })) as Place[]) : [];
  const reviews = (await fetchQuery(api.locations.reviews, {}, opts)) as { _id: string; provider: string; field: string; raw: string; reason: string; candidates: { _id: string; name: string; context: string }[] }[];
  const back = `/admin/locations${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const toggle = (p: { _id: string; name: string }, open: boolean) => (
    <form action={setAreaOpen.bind(null, p._id, !open)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm" aria-label={`${open ? "Close" : "Open"} ${p.name}`}>{open ? "Close" : "Open"}</button></form>
  );
  return (
    <AdminShell active="locations" title="Locations" sub="Localo covers all of New Zealand. Close a region, council area or suburb to stop new bookings and service areas there; closing a wider area closes everything inside it." err={err} ok={ok}>
      <section className="card d-card" aria-labelledby="reg-h">
        <div className="d-card__head"><h2 id="reg-h" className="d-card__title">Regions</h2><span className="d-card__sub num">{cov.regions.filter((r) => r.open).length} open of {cov.regions.length}</span></div>
        <ul className="adm-list">
          {cov.regions.map((r) => (
            <li key={r._id} className="adm-row"><div className="adm-row__main"><strong>{r.name} <span className={`pill pill--${r.open ? "completed" : "neutral"}`}>{r.open ? "Open" : "Closed"}</span></strong></div><div className="adm-act">{toggle(r, r.open)}</div></li>
          ))}
        </ul>
      </section>

      <section className="card d-card" aria-labelledby="find-h">
        <div className="d-card__head"><h2 id="find-h" className="d-card__title">Council areas and suburbs</h2></div>
        <form className="adm-search" role="search"><input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search places" /><button className="btn btn--secondary btn--sm">Search</button>{q && <Link href="/admin/locations" className="lp-link">Clear</Link>}</form>
        {q && found.length === 0 && <p className="field__hint">No place matches.</p>}
        <ul className="adm-list">
          {found.map((p) => (
            <li key={p._id} className="adm-row"><div className="adm-row__main"><strong>{p.name}</strong> <span className="field__hint">{p.context}</span> <span className={`pill pill--${p.open ? "completed" : "neutral"}`}>{p.open ? "Open" : "Closed"}</span></div><div className="adm-act">{toggle(p, p.open)}</div></li>
          ))}
        </ul>
        {cov.closed.length > 0 && (<><h3 className="d-card__title">Closed</h3><ul className="adm-list">
          {cov.closed.map((p) => <li key={p._id} className="adm-row"><div className="adm-row__main"><strong>{p.name}</strong> <span className="field__hint">{p.context}</span></div><div className="adm-act">{toggle(p, false)}</div></li>)}
        </ul></>)}
      </section>

      <section className="card d-card" aria-labelledby="rev-h">
        <div className="d-card__head"><h2 id="rev-h" className="d-card__title">Provider locations to review</h2><span className="d-card__sub num">{reviews.length}</span></div>
        <p className="field__hint">Locations typed by providers that could not be matched to exactly one place. Nothing is changed until you choose.</p>
        {reviews.length === 0 && <p className="field__hint">Nothing to review.</p>}
        <ul className="adm-list">
          {reviews.map((r) => (
            <li key={r._id} className="adm-row"><div className="adm-row__main"><strong>{r.provider}</strong> <span className="field__hint">{r.field === "base" ? "base suburb" : "service area"} &ldquo;{r.raw}&rdquo; · {r.reason}</span>
              <div className="adm-act">{r.candidates.map((c) => (
                <form key={c._id} action={resolveLocationReview.bind(null, r._id, c._id)}><input type="hidden" name="back" value={back} /><button className="btn btn--secondary btn--sm">{c.name}{c.context && `, ${c.context}`}</button></form>
              ))}</div></div>
              <form action={dismissLocationReview.bind(null, r._id)}><input type="hidden" name="back" value={back} /><button className="btn btn--danger btn--sm">Dismiss</button></form></li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}

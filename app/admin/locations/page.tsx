import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { addPopularSuburbs, addSuburbs, removeSuburb, saveCity, setSuburbEnabled } from "../actions";

export const dynamic = "force-dynamic";
type Row = { _id: string; name: string; enabled: boolean };

export default async function AdminLocations({ searchParams }: { searchParams: Promise<{ q?: string; err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { q, err, ok } = await searchParams;
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

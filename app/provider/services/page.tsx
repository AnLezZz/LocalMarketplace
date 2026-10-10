import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { providerSidebarItems } from "../../../lib/providerNav";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import Icon from "../../../components/Icon";
import Banner from "../../../components/Banner";
import { durationLabel, priceLabel } from "../../../components/format";
import { archiveService, saveService, saveServiceAreas, setServiceEnabled } from "./actions";
import "../../providers/[id]/booking.css";

export const dynamic = "force-dynamic";

type Service = { _id: string; name: string; description: string; priceType: "fixed" | "hourly" | "quote"; priceCents?: number; durationMinutes: number; enabled: boolean };

const DURATIONS = [30, 45, 60, 90, 120, 180, 240, 300, 360, 480];

export default async function Services({ searchParams }: { searchParams: Promise<{ err?: string; edit?: string; ok?: string }> }) {
  const { err, edit, ok } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");
  const services = (await fetchQuery(api.services.listMine, {}, opts)) as Service[];
  const editing = services.find((s) => s._id === edit);

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="services" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems()} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Services</h1>
            <p className="d-header__sub">What customers can book from you. Disabled services stay hidden from your public page.</p>
          </div>
          <div className="d-header__actions">
            <Link href="/provider/services#form" className="btn btn--primary d-header__btn"><Icon name="plus" size={16} /><span>Add service</span></Link>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        {ok === "areas" && <Banner tone="success">Service area saved.</Banner>}

        <section className="card d-card" aria-labelledby="svc-h">
          <div className="d-card__head"><h2 id="svc-h" className="d-card__title">Your services</h2><span className="d-card__sub num">{services.length}</span></div>
          {services.length === 0 ? (
            <div className="empty">
              <span className="empty__icon"><Icon name="briefcase" size={26} /></span>
              <h3 className="empty__title">No services yet</h3>
              <p className="empty__text">Add what you offer, with a price and how long it takes. Until then customers book your general rate.</p>
            </div>
          ) : (
            <ul className="svc-list">
              {services.map((s) => (
                <li key={s._id} className="svc-item">
                  <div className="svc-item__main">
                    <strong>{s.name}</strong>
                    {s.description && <span className="svc-item__desc">{s.description}</span>}
                    <span className="svc-item__meta"><span className="num">{priceLabel(s)}</span> · {durationLabel(s.durationMinutes)}</span>
                  </div>
                  <span className={`pill ${s.enabled ? "pill--completed" : "pill--neutral"}`}>{s.enabled ? "Active" : "Disabled"}</span>
                  <div className="svc-item__actions">
                    <Link href={`/provider/services?edit=${s._id}#form`} className="btn btn--secondary btn--sm">Edit</Link>
                    <form action={setServiceEnabled.bind(null, s._id, !s.enabled)}><button className="btn btn--secondary btn--sm">{s.enabled ? "Disable" : "Enable"}</button></form>
                    <form action={archiveService.bind(null, s._id)}><button className="btn btn--danger btn--sm">Archive</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card d-card" aria-labelledby="area-h">
          <div className="d-card__head"><h2 id="area-h" className="d-card__title">Service area</h2><span className="d-card__sub">Based in {profile.suburb}</span></div>
          <form action={saveServiceAreas} className="form">
            <div className="field">
              <label htmlFor="suburbs" className="field__label">Other suburbs you travel to (one per line or comma separated)</label>
              <textarea id="suburbs" name="suburbs" rows={3} defaultValue={(profile.serviceSuburbs ?? []).join(", ")} placeholder="e.g. Grey Lynn, Herne Bay, Mount Eden" />
              <p className="field__hint">Customers outside {profile.suburb} and these suburbs can&apos;t request a booking. Leave this empty to take bookings anywhere.</p>
            </div>
            <button className="btn btn--secondary">Save service area</button>
          </form>
        </section>

        <section className="card d-card" id="form" aria-labelledby="form-h">
          <div className="d-card__head"><h2 id="form-h" className="d-card__title">{editing ? "Edit service" : "Add a service"}</h2>
            {editing && <Link href="/provider/services" className="d-card__link">Cancel edit</Link>}</div>
          <form action={saveService} className="form" key={editing?._id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing._id} />}
            <div className="field"><label htmlFor="name" className="field__label">Name</label>
              <input id="name" name="name" defaultValue={editing?.name} required maxLength={80} placeholder="e.g. Lawn mowing" /></div>
            <div className="field"><label htmlFor="description" className="field__label">Description (optional)</label>
              <textarea id="description" name="description" rows={3} maxLength={500} defaultValue={editing?.description} placeholder="What is included" /></div>
            <div className="form__row">
              <div className="field field--grow"><label htmlFor="priceType" className="field__label">Pricing</label>
                <select id="priceType" name="priceType" defaultValue={editing?.priceType ?? "fixed"}>
                  <option value="fixed">Fixed price</option><option value="hourly">Hourly rate</option><option value="quote">Quote required</option>
                </select></div>
              <div className="field field--grow"><label htmlFor="price" className="field__label">Price in NZD (not used for quotes)</label>
                <input id="price" name="price" type="number" min={1} max={1000} step="0.01" inputMode="decimal" defaultValue={editing?.priceCents ? editing.priceCents / 100 : ""} /></div>
              <div className="field field--grow"><label htmlFor="duration" className="field__label">Typical duration</label>
                <select id="duration" name="duration" defaultValue={editing?.durationMinutes ?? 60}>
                  {DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
                </select></div>
            </div>
            <button className="btn btn--primary">{editing ? "Save changes" : "Add service"}</button>
          </form>
        </section>
      </div>
    </div>
  );
}

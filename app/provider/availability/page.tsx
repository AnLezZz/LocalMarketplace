import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { providerSidebarItems } from "../../../lib/providerNav";
import { minuteLabel } from "../../../lib/time";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import Banner from "../../../components/Banner";
import { addBlock, removeBlock, saveHours } from "./actions";
import "../../providers/[id]/booking.css";

export const dynamic = "force-dynamic";

type Row = { weekday: number; enabled: boolean; startMinute: number; endMinute: number; breakStartMinute?: number; breakEndMinute?: number };
type Block = { _id: string; startsAt: number; endsAt: number; reason?: string };

const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]] as const;
const STEPS = Array.from({ length: 97 }, (_, i) => i * 15); // 0:00 .. 24:00
const fmt = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function TimeSelect({ name, value, none }: { name: string; value?: number; none?: boolean }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={name}>
      {none && <option value="">None</option>}
      {STEPS.filter((m) => m % 30 === 0).map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}
    </select>
  );
}

export default async function Availability({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");
  const mine = (await fetchQuery(api.availability.mine, {}, opts)) as { configured: boolean; hours: Row[]; timeOff: Block[] };
  const byDay = new Map(mine.hours.map((h) => [h.weekday, h]));

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="availability" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems()} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Availability</h1>
            <p className="d-header__sub">Customers can only request times inside your working hours. Accepted bookings and blocked time are removed automatically; pending requests don&apos;t hold a slot.</p>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        {ok && <Banner tone="success">{ok === "saved" ? "Working hours saved." : ok === "blocked" ? "Time blocked." : "Block removed."}</Banner>}
        {!mine.configured && <Banner tone="info">You haven&apos;t set working hours yet, so customers can currently request any time from 8 am to 5 pm. Save your hours below to change that.</Banner>}

        <section className="card d-card" aria-labelledby="wh-h">
          <div className="d-card__head"><h2 id="wh-h" className="d-card__title">Weekly working hours</h2><span className="d-card__sub">Auckland time</span></div>
          <form action={saveHours} className="form">
            <div className="avl">
              {DAYS.map(([d, label]) => {
                const r = byDay.get(d);
                return (
                  <div key={d} className="avl__row">
                    <label className="avl__day"><input type="checkbox" name={`en_${d}`} defaultChecked={r ? r.enabled : d !== 0 && d !== 6} />{label}</label>
                    <div className="avl__times">
                      <TimeSelect name={`start_${d}`} value={r?.startMinute ?? 540} /><span>to</span><TimeSelect name={`end_${d}`} value={r?.endMinute ?? 1020} />
                    </div>
                    <div className="avl__times avl__break"><span>Break</span>
                      <TimeSelect name={`bs_${d}`} value={r?.breakStartMinute} none /><span>to</span><TimeSelect name={`be_${d}`} value={r?.breakEndMinute} none />
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="btn btn--primary">Save working hours</button>
          </form>
        </section>

        <section className="card d-card" aria-labelledby="to-h">
          <div className="d-card__head"><h2 id="to-h" className="d-card__title">Blocked time</h2><span className="d-card__sub">Holidays, days off, appointments</span></div>
          <form action={addBlock} className="form">
            <div className="form__row">
              <div className="field field--grow"><label htmlFor="from" className="field__label">From</label><input id="from" name="from" type="datetime-local" required /></div>
              <div className="field field--grow"><label htmlFor="to" className="field__label">To</label><input id="to" name="to" type="datetime-local" required /></div>
              <div className="field field--grow"><label htmlFor="reason" className="field__label">Reason (optional)</label><input id="reason" name="reason" maxLength={100} placeholder="e.g. Public holiday" /></div>
            </div>
            <button className="btn btn--secondary">Block this time</button>
          </form>
          {mine.timeOff.length > 0 && (
            <ul className="svc-list">
              {mine.timeOff.map((t) => (
                <li key={t._id} className="svc-item">
                  <div className="svc-item__main"><strong>{fmt.format(t.startsAt)} – {fmt.format(t.endsAt)}</strong>{t.reason && <span className="svc-item__desc">{t.reason}</span>}</div>
                  <form action={removeBlock.bind(null, t._id)}><button className="btn btn--danger btn--sm">Remove</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

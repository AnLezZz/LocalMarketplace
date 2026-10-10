import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import Link from "next/link";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import { StatusPill } from "../../components/Pill";
import { bookingPriceLine, bookingWindow } from "../../components/format";
import "./bookings.css";
import AccountShell from "../../components/AccountShell";

const TABS = [["upcoming", "Upcoming"], ["past", "Past"], ["cancelled", "Cancelled"]] as const;
type Tab = (typeof TABS)[number][0];

/** Where a booking belongs: declined/cancelled, still ahead, or already over. */
function tabOf(b: { status: string; endsAt: number }, now: number): Tab {
  if (b.status === "cancelled" || b.status === "declined") return "cancelled";
  if (b.status === "completed" || b.endsAt < now) return "past";
  return "upcoming";
}

export const dynamic = "force-dynamic";

export default async function MyBookings({ searchParams }: { searchParams: Promise<{ err?: string; tab?: string; reviewed?: string }> }) {
  const { err, tab: t, reviewed: justReviewed } = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === t) ? (t as Tab) : "upcoming";
  const opts = await authOpts();
  const all = await fetchQuery(api.bookings.listMine, {}, opts);
  const reviewed = new Map(((await fetchQuery(api.reviews.mine, {}, opts)) as { bookingId: string; rating: number }[]).map((r) => [r.bookingId, r.rating]));
  const now = Date.now();
  const counts = { upcoming: 0, past: 0, cancelled: 0 };
  for (const b of all) counts[tabOf(b, now)]++;
  const rows = all.filter((b: any) => tabOf(b, now) === tab);

  async function cancel(fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), to: "cancelled" }, await authOpts()));
    revalidatePath("/bookings");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/bookings?err=${encodeURIComponent(reason)}` : "/bookings");
  }

  return (
    <AccountShell active="bookings"><div className="acct-pane">
      <h1 className="page__title">My bookings</h1>
      <nav className="btabs" aria-label="Booking status">
        {TABS.map(([k, label]) => (
          <Link key={k} href={k === "upcoming" ? "/bookings" : `/bookings?tab=${k}`} className="btabs__tab" aria-current={tab === k ? "page" : undefined}>
            {label}<span className="num">{counts[k]}</span>
          </Link>
        ))}
      </nav>
      {err && <Banner tone="error">{err}</Banner>}
      {justReviewed && <Banner tone="success">Thanks, your review is published.</Banner>}
      {rows.length === 0 && (
        <div className="empty card">
          <span className="empty__icon"><Icon name="calendar" size={26} /></span>
          <h2 className="empty__title">{all.length === 0 ? "No bookings yet" : `No ${tab} bookings`}</h2>
          <p className="empty__text">{all.length === 0 ? "You have not requested anything yet." : "Nothing here right now."}</p>
          <Link href="/search" className="btn btn--forest">Find a pro</Link>
        </div>
      )}
      <ul className="list">
        {rows.map((b: any) => {
          const w = bookingWindow(b.startsAt, b.endsAt);
          return (
            <li className="card booking" key={b._id}>
              <div className="booking__head">
                <Avatar name={b.providerName} />
                <div className="booking__who">
                  <h2 className="booking__name">{b.serviceName ?? b.providerName}</h2>
                  {b.serviceName && <span className="booking__sub">{b.providerName}</span>}
                  <StatusPill status={b.status} />
                </div>
              </div>
              <dl className="booking__when">
                <div><dt className="sr-only">Date</dt><dd><Icon name="calendar" size={18} />{w.day}</dd></div>
                <div><dt className="sr-only">Time</dt><dd className="num"><Icon name="clock" size={18} />{w.time}</dd></div>
              </dl>
              <p className="booking__desc">{b.description}</p>
              {bookingPriceLine(b, (b.endsAt - b.startsAt) / 3_600_000) && <p className="booking__price num">{bookingPriceLine(b, (b.endsAt - b.startsAt) / 3_600_000)}</p>}
              <div className="booking__actions">
                <Link href={`/bookings/${b._id}`} className="btn btn--secondary">View details</Link>
                {b.status === "completed" && (reviewed.has(b._id)
                  ? <span className="booking__rated">Reviewed <b aria-label={`${reviewed.get(b._id)} out of 5`}>{"★".repeat(reviewed.get(b._id)!)}</b></span>
                  : <Link href={`/bookings/${b._id}/review`} className="btn btn--forest">Leave a review</Link>)}
                {(b.status === "requested" || b.status === "accepted") && (
                  <form action={cancel}>
                    <input type="hidden" name="id" value={b._id} />
                    <button className="btn btn--danger">Cancel</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div></AccountShell>
  );
}

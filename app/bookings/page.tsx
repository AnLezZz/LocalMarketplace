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
import AdminPager from "../../components/dashboard/AdminPager";
import { loadAdminPage, type AdminPage } from "../../lib/adminPage";
import "./bookings.css";
import AccountShell from "../../components/AccountShell";

const PAGE = 20;
const TABS = [["upcoming", "Upcoming"], ["past", "Past"], ["cancelled", "Cancelled"]] as const;
type Tab = (typeof TABS)[number][0];

export const dynamic = "force-dynamic";

export default async function MyBookings({ searchParams }: { searchParams: Promise<{ err?: string; tab?: string; reviewed?: string; cursor?: string; asOf?: string }> }) {
  const { err, tab: t, reviewed: justReviewed, cursor, asOf: asOfParam } = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === t) ? (t as Tab) : "upcoming";
  const opts = await authOpts();
  // "Now" for the whole walk through pages, fixed on the first page and carried in the links (a cursor only fits the query that made it).
  const asOf = Number(asOfParam) > 0 ? Math.min(Number(asOfParam), Date.now()) : Date.now();
  const startUrl = tab === "upcoming" ? "/bookings" : `/bookings?tab=${tab}`;
  const [counts, result] = await Promise.all([
    fetchQuery(api.bookings.customerCounts, { asOf }, opts) as Promise<{ upcoming: number; past: number; cancelled: number; capped: boolean } | null>,
    loadAdminPage<any>(startUrl, cursor, async (c) => (await fetchQuery(api.bookings.customerPage, { tab, paginationOpts: { numItems: PAGE, cursor: c }, asOf }, opts)) as unknown as AdminPage<any>),
  ]);
  const rows = result.page;
  const total = (counts?.upcoming ?? 0) + (counts?.past ?? 0) + (counts?.cancelled ?? 0);
  const countLabel = (n: number) => (n >= 1000 ? "1,000+" : n);

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
            {label}<span className="num">{countLabel(counts?.[k] ?? 0)}</span>
          </Link>
        ))}
      </nav>
      {err && <Banner tone="error">{err}</Banner>}
      {justReviewed && <Banner tone="success">Thanks, your review is published.</Banner>}
      {rows.length === 0 && (
        <div className="empty card">
          <span className="empty__icon"><Icon name="calendar" size={26} /></span>
          <h2 className="empty__title">{total === 0 ? "No bookings yet" : `No ${tab} bookings`}</h2>
          <p className="empty__text">{total === 0 ? "You have not requested anything yet." : "Nothing here right now."}</p>
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
                {b.status === "completed" && (b.reviewRating !== undefined
                  ? <span className="booking__rated">Reviewed <b aria-label={`${b.reviewRating} out of 5`}>{"★".repeat(b.reviewRating)}</b></span>
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
      <AdminPager base="/bookings" params={{ tab: tab === "upcoming" ? undefined : tab }} carry={{ asOf: String(asOf) }} cursor={cursor} result={result} nextLabel="Show more →" />
    </div></AccountShell>
  );
}

import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import Icon from "../../../components/Icon";
import Banner from "../../../components/Banner";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import BookingsTable from "../../../components/provider/BookingsTable";
import { api } from "../../../lib/convex";
import { countLabel, loadProviderShell, type PageResult } from "../../../lib/providerDash";
import { providerSidebarItems } from "../../../lib/providerNav";
import "../../bookings/bookings.css";

export const dynamic = "force-dynamic";

const TABS = [["pending", "Pending"], ["upcoming", "Upcoming"], ["history", "History"], ["all", "All"]] as const;
type Tab = (typeof TABS)[number][0];
const PAGE = 25;

export default async function ProviderBookings({ searchParams }: { searchParams: Promise<{ err?: string; tab?: string; cursor?: string; asOf?: string }> }) {
  const { err, tab: t, cursor, asOf: asOfParam } = await searchParams;
  const { opts, profile, summary } = await loadProviderShell();
  const tab: Tab = TABS.some(([k]) => k === t) ? (t as Tab) : summary.pending > 0 ? "pending" : "upcoming";
  // "Now" for the whole walk through pages, fixed on the first page and carried in the links (cursors only work for the same query).
  const asOf = Number(asOfParam) > 0 ? Math.min(Number(asOfParam), Date.now()) : Date.now();
  const result = (await fetchQuery(api.bookings.providerPage, { tab, paginationOpts: { numItems: PAGE, cursor: cursor || null }, asOf }, opts)) as PageResult<{ _id: string }>;
  const here = `/provider/bookings?tab=${tab}${cursor ? `&cursor=${encodeURIComponent(cursor)}&asOf=${asOf}` : ""}`;

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="bookings" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems(summary.pending)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Bookings</h1>
            <p className="d-header__sub">Pending and upcoming are soonest first; history and all are newest first. Accept or decline requests, and mark finished jobs complete.</p>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        <section className="card d-card" aria-label="Bookings">
          <nav className="btabs" aria-label="Booking filter">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`/provider/bookings?tab=${k}`} className="btabs__tab" aria-current={tab === k ? "page" : undefined}>
                {label}<span className="num">{countLabel(summary[k], summary.cap)}</span>
              </Link>
            ))}
          </nav>
          {result.page.length === 0 ? (
            <div className="empty">
              <span className="empty__icon"><Icon name="inbox" size={26} /></span>
              <h3 className="empty__title">{summary.all === 0 ? "No requests yet" : "Nothing here"}</h3>
              <p className="empty__text">{summary.all === 0 ? "New booking requests from customers in your area will appear here." : "No bookings match this filter."}</p>
            </div>
          ) : (
            <BookingsTable rows={result.page} back={here} />
          )}
          {(cursor || !result.isDone) && (
            <nav className="pager" aria-label="Pages">
              {cursor ? <Link href={`/provider/bookings?tab=${tab}`} className="btn btn--secondary btn--sm">← Back to the start</Link> : <span />}
              {!result.isDone && <Link href={`/provider/bookings?tab=${tab}&cursor=${encodeURIComponent(result.continueCursor)}&asOf=${asOf}`} className="btn btn--secondary btn--sm" rel="next">{tab === "pending" || tab === "upcoming" ? "Later →" : "Older →"}</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";
import Icon from "../../../components/Icon";
import Banner from "../../../components/Banner";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import BookingsTable from "../../../components/provider/BookingsTable";
import { loadProviderDash } from "../../../lib/providerDash";
import { providerSidebarItems } from "../../../lib/providerNav";
import "../../bookings/bookings.css";

export const dynamic = "force-dynamic";

const TABS = [["pending", "Pending"], ["upcoming", "Upcoming"], ["history", "History"], ["all", "All"]] as const;

export default async function ProviderBookings({ searchParams }: { searchParams: Promise<{ err?: string; tab?: string }> }) {
  const { err, tab: t } = await searchParams;
  const { profile, rows, now, pending } = await loadProviderDash();
  const inTab = (b: { status: string; endsAt: number }, k: string) =>
    k === "all" ? true
    : k === "pending" ? b.status === "requested"
    : k === "upcoming" ? b.status === "accepted" && b.endsAt >= now
    : !(b.status === "requested" || (b.status === "accepted" && b.endsAt >= now));
  const tab = TABS.some(([k]) => k === t) ? (t as string) : pending.length > 0 ? "pending" : "upcoming";
  const shown = rows.filter((b) => inTab(b, tab));

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="bookings" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems(pending.length)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Bookings</h1>
            <p className="d-header__sub">Every request and job, newest first. Accept or decline requests, and mark finished jobs complete.</p>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        <section className="card d-card" aria-label="Bookings">
          <nav className="btabs" aria-label="Booking filter">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`/provider/bookings?tab=${k}`} className="btabs__tab" aria-current={tab === k ? "page" : undefined}>
                {label}<span className="num">{rows.filter((b) => inTab(b, k)).length}</span>
              </Link>
            ))}
          </nav>
          {shown.length === 0 ? (
            <div className="empty">
              <span className="empty__icon"><Icon name="inbox" size={26} /></span>
              <h3 className="empty__title">{rows.length === 0 ? "No requests yet" : "Nothing here"}</h3>
              <p className="empty__text">{rows.length === 0 ? "New booking requests from customers in your area will appear here." : "No bookings match this filter."}</p>
            </div>
          ) : (
            <BookingsTable rows={shown} back={`/provider/bookings?tab=${tab}`} />
          )}
        </section>
      </div>
    </div>
  );
}

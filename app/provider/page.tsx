import Link from "next/link";
import Icon from "../../components/Icon";
import Banner from "../../components/Banner";
import { bookingWindow } from "../../components/format";
import DashboardSidebar from "../../components/dashboard/DashboardSidebar";
import StatCard from "../../components/dashboard/StatCard";
import ProviderBanners from "../../components/provider/ProviderBanners";
import BookingsTable from "../../components/provider/BookingsTable";
import { loadProviderDash } from "../../lib/providerDash";
import { providerSidebarItems } from "../../lib/providerNav";
import "../bookings/bookings.css";
import "../providers/[id]/booking.css";

export const dynamic = "force-dynamic";

/** Overview: the numbers, what needs an answer now, and what is next. Everything else has its own page. */
export default async function ProviderHome({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const { profile, rows, pending, upcoming } = await loadProviderDash();
  const completed = rows.filter((b) => b.status === "completed").length;
  const rating = profile.ratingAvg && profile.ratingAvg > 0 ? profile.ratingAvg.toFixed(1) : "–";
  const next = upcoming.slice(0, 3);

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="overview" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems(pending.length)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Welcome back, {profile.name}</h1>
            <p className="d-header__sub">Here&apos;s what&apos;s happening with your business.</p>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        <ProviderBanners profile={profile} />

        <section className="d-stats" aria-label="Business overview statistics">
          <Link href="/provider/bookings?tab=pending" className="stat-link"><StatCard label="Pending requests" value={pending.length} icon="clock" color="amber" trend={pending.length > 0 ? { text: "Action required", neutral: true } : undefined} /></Link>
          <Link href="/provider/bookings?tab=upcoming" className="stat-link"><StatCard label="Upcoming bookings" value={upcoming.length} icon="calendar" color="blue" /></Link>
          <Link href="/provider/bookings?tab=history" className="stat-link"><StatCard label="Completed jobs" value={completed} icon="check" color="green" /></Link>
          <Link href="/provider/reviews" className="stat-link"><StatCard label="Average rating" value={rating} icon="star" color="purple" trend={{ text: `${profile.reviewCount ?? 0} reviews`, neutral: true }} /></Link>
        </section>

        <section className="card d-card" aria-labelledby="act-h">
          <div className="d-card__head">
            <div><h2 id="act-h" className="d-card__title">Needs your answer</h2><span className="d-card__sub num">{pending.length} {pending.length === 1 ? "request" : "requests"}</span></div>
            {pending.length > 0 && <Link href="/provider/bookings?tab=pending" className="d-card__link">See all →</Link>}
          </div>
          {pending.length === 0 ? (
            <div className="empty">
              <span className="empty__icon"><Icon name="check" size={26} /></span>
              <h3 className="empty__title">You&apos;re all caught up</h3>
              <p className="empty__text">New booking requests from customers appear here for you to accept or decline.</p>
            </div>
          ) : (
            <BookingsTable rows={pending.slice(0, 5)} back="/provider" />
          )}
        </section>

        <section className="card d-card" aria-labelledby="next-h">
          <div className="d-card__head">
            <div><h2 id="next-h" className="d-card__title">Coming up</h2><span className="d-card__sub">Your next accepted jobs</span></div>
            <Link href="/provider/calendar" className="d-card__link">Open calendar →</Link>
          </div>
          {next.length === 0 ? (
            <div className="empty">
              <span className="empty__icon"><Icon name="calendar" size={26} /></span>
              <h3 className="empty__title">Nothing booked yet</h3>
              <p className="empty__text">Accepted bookings show up here, and on your calendar.</p>
            </div>
          ) : (
            <ul className="up-list">
              {next.map((b) => {
                const w = bookingWindow(b.startsAt, b.endsAt);
                return (
                  <li key={b._id} className="up-item">
                    <div className="up-item__when"><strong>{w.day}</strong><span className="num">{w.time}</span></div>
                    <div className="up-item__what">
                      <Link href={`/provider/bookings/${b._id}`}>{b.serviceName ?? b.description}</Link>
                      <span>{b.customerName}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

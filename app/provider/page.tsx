import Link from "next/link";
import { providerSidebarItems } from "../../lib/providerNav";
import { reportReview, transitionBooking } from "./actions";
import "../bookings/bookings.css";
import "../providers/[id]/booking.css";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import { StatusPill } from "../../components/Pill";
import { bookingWindow } from "../../components/format";
import DashboardSidebar from "../../components/dashboard/DashboardSidebar";
import StatCard from "../../components/dashboard/StatCard";
import WeeklyCalendar from "../../components/dashboard/WeeklyCalendar";

export const dynamic = "force-dynamic";

export default async function ProviderHome({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; tab?: string; reported?: string }>;
}) {
  const { err, tab: t, reported } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");

  const rows = await fetchQuery(api.bookings.listIncoming, {}, opts);
  const reviews = ((await fetchQuery(api.reviews.forProvider, { providerId: profile._id })) as { _id: string; customerName: string; rating: number; text: string }[]).slice(0, 5);

  // Compute live KPIs
  const pendingRequests = rows.filter((b: any) => b.status === "requested").length;
  const upcomingBookings = rows.filter(
    (b: any) => b.status === "accepted" && b.endsAt > Date.now()
  ).length;
  const now = Date.now();
  const TABS = [["pending", "Pending"], ["upcoming", "Upcoming"], ["history", "History"], ["all", "All"]] as const;
  const inTab = (b: any, k: string) =>
    k === "all" ? true
    : k === "pending" ? b.status === "requested"
    : k === "upcoming" ? b.status === "accepted" && b.endsAt >= now
    : !(b.status === "requested" || (b.status === "accepted" && b.endsAt >= now));
  const tab = TABS.some(([k]) => k === t) ? (t as string) : pendingRequests > 0 ? "pending" : "upcoming";
  const shown = rows.filter((b: any) => inTab(b, tab));
  const completedJobs = rows.filter((b: any) => b.status === "completed").length;
  const ratingAvg =
    profile.ratingAvg && profile.ratingAvg > 0
      ? profile.ratingAvg.toFixed(1)
      : "–";

  const sidebarItems = providerSidebarItems(pendingRequests);

  return (
    <div className="d-layout">
      {/* Dark Sidebar */}
      <DashboardSidebar
        portal="business"
        activeId="overview"
        user={{
          name: profile.name,
          subtext: "View profile",
          profileHref: "/provider/register",
        }}
        items={sidebarItems}
      />

      {/* Main Workspace */}
      <div className="d-main">
        {/* Header bar */}
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Welcome back, {profile.name}</h1>
            <p className="d-header__sub">Here&apos;s what&apos;s happening with your business.</p>
          </div>
          <div className="d-header__actions">
            <Link href="/provider/services#form" className="btn btn--primary d-header__btn">
              <Icon name="plus" size={16} />
              <span>Add new service</span>
            </Link>
          </div>
        </header>

        {/* Status / Alert Banners */}
        {err && <Banner tone="error">{err}</Banner>}
        {reported && <Banner tone="success">Thanks, we'll look at that review and let you know.</Banner>}

        {profile.status === "pending" && (
          <div className="card d-banner d-banner--pending">
            <div className="d-banner__icon">
              <Icon name="clock" size={24} />
            </div>
            <div className="d-banner__content">
              <h2 className="d-banner__title">Application under review</h2>
              <p className="d-banner__text">
                Your profile is being reviewed by the Localo admin team. Once approved, you
                will appear in local search results and receive new customer bookings.
              </p>
            </div>
            <Link href="/provider/register" className="btn btn--secondary btn--sm">
              Edit application
            </Link>
          </div>
        )}

        {profile.status === "suspended" && (
          <div className="card d-banner d-banner--rejected">
            <div className="d-banner__icon"><Icon name="alert" size={24} /></div>
            <div className="d-banner__content">
              <h2 className="d-banner__title">Your listing is suspended</h2>
              <p className="d-banner__text">Customers can&apos;t find you or book you right now. <strong>Reason:</strong> {profile.suspendedReason}. Contact support to appeal.</p>
            </div>
          </div>
        )}

        {profile.status === "rejected" && (
          <div className="card d-banner d-banner--rejected">
            <div className="d-banner__icon">
              <Icon name="alert" size={24} />
            </div>
            <div className="d-banner__content">
              <h2 className="d-banner__title">Application needs changes</h2>
              <p className="d-banner__text">
                <strong>Review feedback:</strong> {profile.rejectionReason}
              </p>
            </div>
            <Link href="/provider/register" className="btn btn--primary btn--sm">
              Update and resubmit
            </Link>
          </div>
        )}

        {/* 4 Stat Cards matching PRD Mockup 2 */}
        <section className="d-stats" aria-label="Business overview statistics">
          <StatCard
            label="Pending requests"
            value={pendingRequests}
            icon="clock"
            color="amber"
            trend={pendingRequests > 0 ? { text: "Action required", neutral: true } : undefined}
          />
          <StatCard
            label="Upcoming bookings"
            value={upcomingBookings}
            icon="calendar"
            color="blue"
          />
          <StatCard
            label="Completed jobs"
            value={completedJobs}
            icon="check"
            color="green"
          />
          <StatCard
            label="Average rating"
            value={ratingAvg}
            icon="star"
            color="purple"
            trend={{ text: `${profile.reviewCount ?? 0} reviews`, neutral: true }}
          />
        </section>

        {/* 2-Column Section: Upcoming Bookings & Weekly Calendar */}
        <div className="d-grid" id="bookings">
          {/* Column 1: Upcoming Bookings */}
          <section className="card d-card" aria-labelledby="upcoming-heading">
            <div className="d-card__head">
              <div>
                <h2 id="upcoming-heading" className="d-card__title">Bookings</h2>
                <span className="d-card__sub num">{rows.length} total bookings</span>
              </div>
            </div>
            <nav className="btabs" aria-label="Booking filter">
              {TABS.map(([k, label]) => (
                <Link key={k} href={`/provider?tab=${k}#bookings`} className="btabs__tab" aria-current={tab === k ? "page" : undefined}>
                  {label}<span className="num">{rows.filter((b: any) => inTab(b, k)).length}</span>
                </Link>
              ))}
            </nav>

            {shown.length === 0 ? (
              <div className="empty">
                <span className="empty__icon">
                  <Icon name="inbox" size={26} />
                </span>
                <h3 className="empty__title">{rows.length === 0 ? "No requests yet" : "Nothing here"}</h3>
                <p className="empty__text">
                  {rows.length === 0 ? "New booking requests from customers in your area will appear here." : "No bookings match this filter."}
                </p>
              </div>
            ) : (
              <div className="d-table-wrapper">
                <table className="d-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Service</th>
                      <th>Customer</th>
                      <th className="d-table__th-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 50).map((b: any) => {
                      const w = bookingWindow(b.startsAt, b.endsAt);
                      return (
                        <tr key={b._id}>
                          <td>
                            <div className="d-table__datetime">
                              <span className="d-table__date">{w.day}</span>
                              <span className="d-table__time num">{w.time}</span>
                            </div>
                          </td>
                          <td>
                            <Link href={`/provider/bookings/${b._id}`} className="d-table__service">{b.serviceName ?? b.description}</Link>
                          </td>
                          <td>
                            <div className="d-table__customer">
                              <Avatar name={b.customerName} size={28} />
                              <span>{b.customerName}</span>
                            </div>
                          </td>
                          <td className="d-table__td-right">
                            {b.status === "requested" ? (
                              <form className="d-table__actions">
                                <input type="hidden" name="id" value={b._id} />
                                {b.priceType === "quote" && b.quoteStatus !== "accepted" ? (
                                  <Link href={`/provider/bookings/${b._id}`} className="btn btn--primary btn--sm">
                                    {b.quoteStatus === "offered" ? "Quote sent" : "Send quote"}
                                  </Link>
                                ) : (
                                  <button
                                    className="btn btn--primary btn--sm"
                                    formAction={transitionBooking.bind(null, "accepted", `/provider?tab=${tab}`)}
                                  >
                                    Accept
                                  </button>
                                )}
                                <button
                                  className="btn btn--danger btn--sm"
                                  formAction={transitionBooking.bind(null, "declined", `/provider?tab=${tab}`)}
                                >
                                  Decline
                                </button>
                              </form>
                            ) : b.status === "accepted" ? (
                              <form className="d-table__actions">
                                <input type="hidden" name="id" value={b._id} />
                                <StatusPill status={b.status} />
                                <button
                                  className="btn btn--secondary btn--sm"
                                  formAction={transitionBooking.bind(null, "completed", `/provider?tab=${tab}`)}
                                >
                                  Complete
                                </button>
                                <button
                                  className="btn btn--danger btn--sm"
                                  formAction={transitionBooking.bind(null, "cancelled", `/provider?tab=${tab}`)}
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <StatusPill status={b.status} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Column 2: Your Calendar Schedule Widget */}
          <section id="calendar" aria-label="Interactive weekly calendar">
            <WeeklyCalendar bookings={rows} providerCategory={profile.category} />
          </section>
          <section className="card d-card" id="reviews" aria-labelledby="rev-h">
            <div className="d-card__head">
              <div><h2 id="rev-h" className="d-card__title">Recent reviews</h2><span className="d-card__sub num">{profile.reviewCount} total</span></div>
            </div>
            {reviews.length === 0 ? (
              <div className="empty"><h3 className="empty__title">No written reviews yet</h3><p className="empty__text">Reviews appear here after customers rate a completed job.</p></div>
            ) : (
              <ul className="rv-list">
                {reviews.map((r) => (
                  <li key={r._id} className="rv">
                    <div className="rv__head"><strong>{r.customerName}</strong><span className="rv__stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></div>
                    {r.text && <p>{r.text}</p>}
                    <details className="rv__report">
                      <summary>Report this review</summary>
                      <form action={reportReview} className="adm-act">
                        <input type="hidden" name="id" value={r._id} />
                        <input name="reason" required minLength={10} maxLength={500} placeholder="What is wrong with it?" aria-label="Why are you reporting this review?" />
                        <button className="btn btn--secondary btn--sm">Send report</button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

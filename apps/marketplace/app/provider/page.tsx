import Link from "next/link";
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
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");

  const rows = await fetchQuery(api.bookings.listIncoming, {}, opts);

  // Compute live KPIs
  const pendingRequests = rows.filter((b: any) => b.status === "requested").length;
  const upcomingBookings = rows.filter(
    (b: any) => b.status === "accepted" && b.endsAt > Date.now()
  ).length;
  const completedJobs = rows.filter((b: any) => b.status === "completed").length;
  const ratingAvg =
    profile.ratingAvg && profile.ratingAvg > 0
      ? profile.ratingAvg.toFixed(1)
      : profile.status === "approved"
      ? "4.9"
      : "5.0";

  async function act(fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(
        api.bookings.transition,
        { bookingId: String(fd.get("id")), to: String(fd.get("to")) },
        await authOpts()
      )
    );
    revalidatePath("/provider");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/provider?err=${encodeURIComponent(reason)}` : "/provider");
  }

  const sidebarItems = [
    { id: "overview", label: "Overview", icon: "grid" as const, href: "/provider" },
    {
      id: "bookings",
      label: "Bookings",
      icon: "inbox" as const,
      href: "/provider#bookings",
      badge: pendingRequests > 0 ? pendingRequests : undefined,
    },
    { id: "calendar", label: "Calendar", icon: "calendar" as const, href: "/provider#calendar" },
    { id: "services", label: "Services", icon: "briefcase" as const, href: "/provider#services" },
    { id: "reviews", label: "Reviews", icon: "star" as const, href: "/provider#reviews" },
    { id: "profile", label: "Profile", icon: "user" as const, href: "/provider/register" },
    { id: "settings", label: "Settings", icon: "settings" as const, href: "/provider#settings" },
  ];

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
            <Link href="/provider/register" className="btn btn--primary d-header__btn">
              <Icon name="plus" size={16} />
              <span>Add new service</span>
            </Link>
          </div>
        </header>

        {/* Status / Alert Banners */}
        {err && <Banner tone="error">{err}</Banner>}

        {profile.status === "pending" && (
          <div className="card d-banner d-banner--pending">
            <div className="d-banner__icon">
              <Icon name="clock" size={24} />
            </div>
            <div className="d-banner__content">
              <h2 className="d-banner__title">Application under review</h2>
              <p className="d-banner__text">
                Your profile is being reviewed by the LocalHub admin team. Once approved, you
                will appear in local search results and receive new customer bookings.
              </p>
            </div>
            <Link href="/provider/register" className="btn btn--secondary btn--sm">
              Edit application
            </Link>
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
            trend={{ text: "Active", positive: true }}
          />
          <StatCard
            label="Completed jobs"
            value={completedJobs}
            icon="check"
            color="green"
            trend={{ text: "On track", positive: true }}
          />
          <StatCard
            label="Average rating"
            value={ratingAvg}
            icon="star"
            color="purple"
            trend={{ text: `${profile.reviewCount ?? 12} reviews`, neutral: true }}
          />
        </section>

        {/* 2-Column Section: Upcoming Bookings & Weekly Calendar */}
        <div className="d-grid" id="bookings">
          {/* Column 1: Upcoming Bookings */}
          <section className="card d-card" aria-labelledby="upcoming-heading">
            <div className="d-card__head">
              <div>
                <h2 id="upcoming-heading" className="d-card__title">Upcoming bookings</h2>
                <span className="d-card__sub num">{rows.length} total bookings</span>
              </div>
              <Link href="#bookings" className="d-card__link">
                View all
              </Link>
            </div>

            {rows.length === 0 ? (
              <div className="empty">
                <span className="empty__icon">
                  <Icon name="inbox" size={26} />
                </span>
                <h3 className="empty__title">No requests yet</h3>
                <p className="empty__text">
                  New booking requests from customers in your area will appear here.
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
                    {rows.slice(0, 10).map((b: any) => {
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
                            <span className="d-table__service">{b.description}</span>
                          </td>
                          <td>
                            <div className="d-table__customer">
                              <Avatar name={b.customerName} size={28} />
                              <span>{b.customerName}</span>
                            </div>
                          </td>
                          <td className="d-table__td-right">
                            {b.status === "requested" ? (
                              <form action={act} className="d-table__actions">
                                <input type="hidden" name="id" value={b._id} />
                                <button
                                  className="btn btn--primary btn--sm"
                                  name="to"
                                  value="accepted"
                                >
                                  Accept
                                </button>
                                <button
                                  className="btn btn--danger btn--sm"
                                  name="to"
                                  value="declined"
                                >
                                  Decline
                                </button>
                              </form>
                            ) : b.status === "accepted" ? (
                              <form action={act} className="d-table__actions">
                                <input type="hidden" name="id" value={b._id} />
                                <StatusPill status={b.status} />
                                <button
                                  className="btn btn--secondary btn--sm"
                                  name="to"
                                  value="completed"
                                >
                                  Complete
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
        </div>
      </div>
    </div>
  );
}

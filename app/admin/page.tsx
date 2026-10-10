import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts, getMe } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import { StatusPill } from "../../components/Pill";
import { loadCategories, metaIn } from "../../lib/categories";
import { bookingWindow } from "../../components/format";
import { adminSidebarItems } from "../../lib/adminNav";
import DashboardSidebar from "../../components/dashboard/DashboardSidebar";
import StatCard from "../../components/dashboard/StatCard";
import AdminPager from "../../components/dashboard/AdminPager";
import { loadAdminPage, type AdminPage } from "../../lib/adminPage";

export const dynamic = "force-dynamic";

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; pcursor?: string }>;
}) {
  const me = await getMe();
  if (me?.role !== "admin") notFound();

  const { err, pcursor } = await searchParams;
  const opts = await authOpts();
  const cats = await loadCategories();

  const [pendingPage, stats, recentBookings] = await Promise.all([
    loadAdminPage<any>("/admin", pcursor, async (c) => (await fetchQuery(api.admin.listPending, { paginationOpts: { numItems: 10, cursor: c } }, opts)) as unknown as AdminPage<any>),
    fetchQuery(api.admin.getStats, {}, opts),
    fetchQuery(api.admin.listRecentBookings, {}, opts),
  ]);

  const pending = pendingPage.page;

  // The decision is bound per button (button name/value is not delivered to server actions here).
  async function decide(decision: "approve" | "reject", fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(
        api.admin.review,
        {
          providerId: String(fd.get("id")),
          decision,
          reason: String(fd.get("reason") ?? ""),
          submittedAt: Number(fd.get("submittedAt")),
        },
        await authOpts()
      )
    );
    revalidatePath("/admin");
    redirect(r.ok ? "/admin" : `/admin?err=${encodeURIComponent(r.message)}`);
  }

  const sidebarItems = adminSidebarItems({ applications: stats.pendingApprovals });

  return (
    <div className="d-layout">
      {/* Dark Sidebar */}
      <DashboardSidebar
        portal="admin"
        activeId="dashboard"
        user={{
          name: me.name || "Platform Admin",
          subtext: "Admin",
        }}
        items={sidebarItems}
      />

      {/* Main Workspace */}
      <div className="d-main">
        {/* Header bar */}
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Platform Overview</h1>
            <p className="d-header__sub">Key metrics and activity across your marketplace.</p>
          </div>
        </header>

        {err && <Banner tone="error">{err}</Banner>}

        {/* 4 Stat Cards matching PRD Mockup 3 */}
        <section className="d-stats" aria-label="Platform metrics">
          <StatCard
            label="Total Providers"
            value={stats.totalProviders}
            icon="users"
            color="green"
          />
          <StatCard
            label="Total Bookings"
            value={stats.totalBookings}
            icon="calendar"
            color="blue"
          />
          <StatCard
            label="Average Rating"
            value={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : "–"}
            icon="star"
            color="purple"
          />
          <StatCard
            label="Pending Approvals"
            value={stats.pendingApprovals}
            icon="shield"
            color={stats.pendingApprovals > 0 ? "amber" : "green"}
            trend={
              stats.pendingApprovals > 0
                ? { text: `${stats.pendingApprovals} Pending`, neutral: true }
                : { text: "All clear", positive: true }
            }
          />
        </section>

        {/* 2-Column Section: Recent Bookings & Provider Applications */}
        <div className="d-grid">
          {/* Column 1: Recent Bookings Table */}
          <section className="card d-card" id="bookings" aria-labelledby="recent-bookings-title">
            <div className="d-card__head">
              <div>
                <h2 id="recent-bookings-title" className="d-card__title">Recent Bookings</h2>
                <span className="d-card__sub num">{recentBookings.length} latest events</span>
              </div>
              <Link href="#bookings" className="d-card__link">
                View all &rarr;
              </Link>
            </div>

            {recentBookings.length === 0 ? (
              <div className="empty">
                <span className="empty__icon">
                  <Icon name="calendar" size={26} />
                </span>
                <h3 className="empty__title">No bookings yet</h3>
                <p className="empty__text">Platform bookings will be tracked and displayed here.</p>
              </div>
            ) : (
              <div className="d-table-wrapper">
                <table className="d-table d-table--stack d-table--recent">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Provider</th>
                      <th>Service</th>
                      <th className="d-table__th-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b: any) => {
                      const w = bookingWindow(b.startsAt, b.endsAt);
                      return (
                        <tr key={b._id}>
                          <td data-label="Date">
                            <span className="d-table__date num">{w.day.split(",")[0]}</span>
                          </td>
                          <td data-label="Customer">
                            <span className="d-table__client-name">{b.customerName}</span>
                          </td>
                          <td data-label="Provider">
                            <span className="d-table__provider-name">{b.providerName}</span>
                          </td>
                          <td data-label="Service">
                            <span className="d-table__service">{b.description || b.service}</span>
                          </td>
                          <td className="d-table__td-right">
                            <StatusPill status={b.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Column 2: Provider Applications Review Queue */}
          <section className="card d-card" id="providers" aria-labelledby="applications-title">
            <div className="d-card__head">
              <div>
                <h2 id="applications-title" className="d-card__title">Provider Applications</h2>
                <span className="d-card__sub num">{stats.pendingApprovals} pending review</span>
              </div>
              <Link href="#providers" className="d-card__link">
                View all
              </Link>
            </div>

            {pending.length === 0 ? (
              <div className="empty">
                <span className="empty__icon">
                  <Icon name="shield" size={26} />
                </span>
                <h3 className="empty__title">All caught up</h3>
                <p className="empty__text">No pending provider applications waiting for review.</p>
              </div>
            ) : (
              <ul className="d-app-list">
                {pending.map((p: any) => {
                  const cat = metaIn(cats.all, p.category);
                  const rateStr = `$${(p.rateCents / 100).toFixed(2)} ${
                    p.rateBasis === "hourly" ? "per hour" : "fixed"
                  }`;
                  return (
                    <li key={p._id} className="d-app-item">
                      <div className="d-app-item__head">
                        <Avatar name={p.name} size={40} />
                        <div className="d-app-item__info">
                          <h3 className="d-app-item__name">{p.name}</h3>
                          <div className="d-app-item__meta">
                            <span className="pill pill--sm">{cat.label}</span>
                            <span>{p.suburb}</span>
                            <span className="num font-semibold">{rateStr}</span>
                          </div>
                        </div>
                      </div>

                      <p className="d-app-item__bio">{p.bio}</p>
                      {p.categorySuggestion && (
                        <p className="d-app-item__bio"><strong>Suggested category:</strong> {p.categorySuggestion}</p>
                      )}

                      <form className="d-app-item__form">
                        <input type="hidden" name="id" value={p._id} />
                        <input type="hidden" name="submittedAt" value={p.submittedAt} />

                        <div className="field">
                          <label htmlFor={`reason-${p._id}`} className="field__label sr-only">
                            Rejection Reason
                          </label>
                          <input
                            id={`reason-${p._id}`}
                            name="reason"
                            placeholder="Reason (required only to reject)"
                            className="input--sm"
                          />
                        </div>

                        <div className="d-app-item__actions">
                          <button
                            type="submit"
                            formAction={decide.bind(null, "approve")}
                            className="btn btn--primary btn--sm"
                          >
                            Accept
                          </button>
                          <button
                            type="submit"
                            formAction={decide.bind(null, "reject")}
                            className="btn btn--danger btn--sm"
                          >
                            Decline
                          </button>
                        </div>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
            <AdminPager base="/admin" cursor={pcursor} cursorParam="pcursor" nextLabel="Next applications →" result={pendingPage} />
          </section>
        </div>
      </div>
    </div>
  );
}

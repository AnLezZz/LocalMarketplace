import Link from "next/link";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import WeeklyCalendar from "../../../components/dashboard/WeeklyCalendar";
import Icon from "../../../components/Icon";
import { loadProviderShell } from "../../../lib/providerDash";
import { providerSidebarItems } from "../../../lib/providerNav";

export const dynamic = "force-dynamic";

export default async function ProviderCalendar() {
  const { profile, summary } = await loadProviderShell();
  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="calendar" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems(summary.pending)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Calendar</h1>
            <p className="d-header__sub">Your jobs, week by week, in Auckland time. Pick one to see the booking.</p>
          </div>
          <div className="d-header__actions">
            <Link href="/provider/availability" className="btn btn--secondary d-header__btn"><Icon name="clock" size={16} /><span>Working hours</span></Link>
          </div>
        </header>
        <WeeklyCalendar providerCategory={profile.category} />
      </div>
    </div>
  );
}

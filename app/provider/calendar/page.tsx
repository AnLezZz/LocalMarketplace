import Link from "next/link";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import WeeklyCalendar from "../../../components/dashboard/WeeklyCalendar";
import Icon from "../../../components/Icon";
import { loadProviderDash } from "../../../lib/providerDash";
import { providerSidebarItems } from "../../../lib/providerNav";

export const dynamic = "force-dynamic";

export default async function ProviderCalendar() {
  const { profile, rows, pending } = await loadProviderDash();
  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="calendar" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems(pending.length)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Calendar</h1>
            <p className="d-header__sub">Your accepted jobs, week by week.</p>
          </div>
          <div className="d-header__actions">
            <Link href="/provider/availability" className="btn btn--secondary d-header__btn"><Icon name="clock" size={16} /><span>Working hours</span></Link>
          </div>
        </header>
        <WeeklyCalendar bookings={rows} providerCategory={profile.category} />
      </div>
    </div>
  );
}

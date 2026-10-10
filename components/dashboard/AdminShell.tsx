import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts, getMe } from "../../lib/auth";
import { adminSidebarItems } from "../../lib/adminNav";
import DashboardSidebar from "./DashboardSidebar";
import Banner from "../Banner";

/** Frame for every admin page. Non-admins get a 404, so the pages are not even discoverable. */
export default async function AdminShell({ active, title, sub, err, ok, children }: { active: string; title: string; sub?: string; err?: string; ok?: string; children: React.ReactNode }) {
  const me = await getMe();
  if (me?.role !== "admin") notFound();
  const opts = await authOpts();
  const counts = (await fetchQuery(api.admin.sidebarCounts, {}, opts)) as { applications: number; reports: number; disputes: number; categoryRequests: number };
  return (
    <div className="d-layout">
      <DashboardSidebar portal="admin" activeId={active} user={{ name: me.name || "Platform Admin", subtext: "Admin" }}
        items={adminSidebarItems(counts)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">{title}</h1>
            {sub && <p className="d-header__sub">{sub}</p>}
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        {ok && <Banner tone="success">{ok}</Banner>}
        {children}
      </div>
    </div>
  );
}

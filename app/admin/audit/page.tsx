import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import AdminPager from "../../../components/dashboard/AdminPager";
import { ADMIN_PAGE_SIZE, loadAdminPage, type AdminPage } from "../../../lib/adminPage";

export const dynamic = "force-dynamic";
type Row = { _id: string; at: number; action: string; targetType: string; targetId: string; reason?: string; actor: string };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  await requireAdminPage();
  const { cursor } = await searchParams;
  const opts = await authOpts();
  const result = await loadAdminPage<Row>("/admin/audit", cursor, async (c) => (await fetchQuery(api.admin.listAudit, { paginationOpts: { numItems: ADMIN_PAGE_SIZE, cursor: c } }, opts)) as AdminPage<Row>);
  const rows = result.page;
  return (
    <AdminShell active="audit" title="Audit log" sub="Every admin action, newest first. This log cannot be edited.">
      <section className="card d-card">
        {rows.length === 0 ? <div className="empty"><h3 className="empty__title">Nothing recorded yet</h3></div> : (
          <div className="d-table-wrapper">
            <table className="d-table">
              <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}><td className="num">{when(r.at)}</td><td>{r.actor}</td><td><code>{r.action}</code></td><td>{r.targetType} <code>{r.targetId.slice(-6)}</code></td><td>{r.reason ?? ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPager base="/admin/audit" cursor={cursor} result={result} />
      </section>
    </AdminShell>
  );
}

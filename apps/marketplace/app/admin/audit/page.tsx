import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";

export const dynamic = "force-dynamic";
type Row = { _id: string; at: number; action: string; targetType: string; targetId: string; reason?: string; actor: string };

export default async function AdminAudit() {
  await requireAdminPage();
  const rows = (await fetchQuery(api.admin.listAudit, {}, await authOpts())) as Row[];
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
      </section>
    </AdminShell>
  );
}

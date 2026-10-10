import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { reactivateUser, suspendUser } from "../actions";

export const dynamic = "force-dynamic";
const FILTERS = [["", "All"], ["active", "Active"], ["suspended", "Suspended"]] as const;
type Row = { _id: string; name: string | null; email: string | null; role: string; joined: number; suspendedAt?: number; suspendedReason?: string };

export default async function AdminAccounts({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { status, q, err, ok } = await searchParams;
  const rows = (await fetchQuery(api.admin.listUsers, { status: status || undefined, q: q || undefined }, await authOpts())) as Row[];
  const back = `/admin/customers${status || q ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}` : ""}`;
  return (
    <AdminShell active="customers" title="Accounts" sub="A suspended account can sign in and read, but cannot book, review, message or change anything. Suspending a provider's account also takes their listing down." err={err} ok={ok}>
      <section className="card d-card">
        <div className="adm-bar">
          <div className="adm-filters">
            {FILTERS.map(([k, label]) => <Link key={k} href={k ? `/admin/customers?status=${k}` : "/admin/customers"} aria-current={(status ?? "") === k ? "page" : undefined}>{label}</Link>)}
          </div>
          <form className="adm-search" role="search"><input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search accounts" />{status && <input type="hidden" name="status" value={status} />}<button className="btn btn--secondary btn--sm">Search</button></form>
        </div>
        <ul className="adm-list">
          {rows.map((u) => (
            <li key={u._id} className="adm-row">
              <div className="adm-row__main">
                <strong>{u.name ?? "(no name)"} <span className={`pill pill--${u.suspendedAt ? "danger" : "neutral"}`}>{u.suspendedAt ? "suspended" : u.role}</span></strong>
                <span>{u.email ?? "no email"} · joined {when(u.joined)}</span>
                {u.suspendedReason && <span>Suspended: {u.suspendedReason}</span>}
              </div>
              <div className="adm-act">
                {u.role !== "admin" && !u.suspendedAt && (
                  <details className="adm-more"><summary className="btn btn--danger btn--sm">Suspend…</summary><form action={suspendUser}><input type="hidden" name="id" value={u._id} /><input type="hidden" name="back" value={back} />
                    <input name="reason" required minLength={5} maxLength={500} placeholder="Reason" aria-label={`Reason for suspending ${u.email}`} /><button className="btn btn--danger btn--sm">Confirm suspend</button></form></details>
                )}
                {u.suspendedAt && (
                  <details className="adm-more"><summary className="btn btn--secondary btn--sm">Reactivate…</summary><form action={reactivateUser}><input type="hidden" name="id" value={u._id} /><input type="hidden" name="back" value={back} />
                    <input name="reason" maxLength={500} placeholder="Note (optional)" aria-label={`Note for reactivating ${u.email}`} /><button className="btn btn--primary btn--sm">Confirm reactivate</button></form></details>
                )}
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <div className="empty"><h3 className="empty__title">No accounts match</h3></div>}
      </section>
    </AdminShell>
  );
}

import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { PROVIDER_PILL, requireAdminPage } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { reactivateProvider, suspendProvider } from "../actions";

export const dynamic = "force-dynamic";
const FILTERS = [["", "All"], ["approved", "Approved"], ["pending", "Pending"], ["rejected", "Rejected"], ["suspended", "Suspended"]] as const;

type Row = { _id: string; name: string; category: string; suburb: string; status: string; ownerEmail: string | null; ratingAvg: number; reviewCount: number; suspendedReason?: string; rejectionReason?: string };

export default async function AdminProviders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { status, q, err, ok } = await searchParams;
  const rows = (await fetchQuery(api.admin.listProviders, { status: status || undefined, q: q || undefined }, await authOpts())) as Row[];
  const back = `/admin/providers${status || q ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}` : ""}`;
  return (
    <AdminShell active="providers" title="Providers" sub="Suspending hides a provider from search and stops new bookings. Pending applications are reviewed on the dashboard." err={err} ok={ok}>
      <section className="card d-card">
        <div className="adm-filters">
          {FILTERS.map(([k, label]) => <Link key={k} href={k ? `/admin/providers?status=${k}` : "/admin/providers"} aria-current={(status ?? "") === k ? "page" : undefined}>{label}</Link>)}
          <form className="adm-search" role="search"><input name="q" defaultValue={q} placeholder="Search name, suburb, email" aria-label="Search providers" />{status && <input type="hidden" name="status" value={status} />}<button className="btn btn--secondary btn--sm">Search</button></form>
        </div>
        {rows.length === 0 ? <div className="empty"><h3 className="empty__title">No providers match</h3></div> : (
          <ul className="adm-list">
            {rows.map((p) => (
              <li key={p._id} className="adm-row">
                <div className="adm-row__main">
                  <strong>{p.name} <span className={`pill pill--${PROVIDER_PILL[p.status] ?? "neutral"}`}>{p.status}</span></strong>
                  <span>{p.category} · {p.suburb} · ★ {p.ratingAvg} ({p.reviewCount})</span>
                  <span>{p.ownerEmail ?? "Seeded listing, no owner"}</span>
                  {p.suspendedReason && <span>Suspended: {p.suspendedReason}</span>}
                  {p.rejectionReason && <span>Rejected: {p.rejectionReason}</span>}
                </div>
                <div className="adm-act">
                  {p.status === "approved" && (
                    <form action={suspendProvider}><input type="hidden" name="id" value={p._id} /><input type="hidden" name="back" value={back} />
                      <input name="reason" required minLength={5} maxLength={500} placeholder="Reason (shown to the provider)" aria-label={`Reason for suspending ${p.name}`} />
                      <button className="btn btn--danger btn--sm">Suspend</button></form>
                  )}
                  {p.status === "suspended" && (
                    <form action={reactivateProvider}><input type="hidden" name="id" value={p._id} /><input type="hidden" name="back" value={back} />
                      <input name="reason" maxLength={500} placeholder="Note (optional)" aria-label={`Note for reactivating ${p.name}`} />
                      <button className="btn btn--primary btn--sm">Reactivate</button></form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

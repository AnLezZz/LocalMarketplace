import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { StatusPill } from "../../../components/Pill";

export const dynamic = "force-dynamic";
const FILTERS = [["", "All"], ["requested", "Requested"], ["accepted", "Accepted"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["declined", "Declined"]] as const;
type Row = { _id: string; customerName: string; providerName: string; serviceName?: string; status: string; startsAt: number; suburb?: string; disputeOpen: boolean };

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdminPage();
  const { status, q } = await searchParams;
  const rows = (await fetchQuery(api.admin.listBookings, { status: status || undefined, q: q || undefined }, await authOpts())) as Row[];
  return (
    <AdminShell active="bookings" title="Bookings" sub="The 300 most recent bookings. Open one to investigate or cancel it.">
      <section className="card d-card">
        <div className="adm-filters">
          {FILTERS.map(([k, label]) => <Link key={k} href={k ? `/admin/bookings?status=${k}` : "/admin/bookings"} aria-current={(status ?? "") === k ? "page" : undefined}>{label}</Link>)}
          <form className="adm-search" role="search"><input name="q" defaultValue={q} placeholder="Search customer, provider, service" aria-label="Search bookings" />{status && <input type="hidden" name="status" value={status} />}<button className="btn btn--secondary btn--sm">Search</button></form>
        </div>
        {rows.length === 0 ? <div className="empty"><h3 className="empty__title">No bookings match</h3></div> : (
          <ul className="adm-list">
            {rows.map((b) => (
              <li key={b._id} className="adm-row">
                <div className="adm-row__main">
                  <strong><Link href={`/admin/bookings/${b._id}`}>{b.serviceName ?? "Booking"} · {b.customerName} → {b.providerName}</Link></strong>
                  <span>{when(b.startsAt)}{b.suburb ? ` · ${b.suburb}` : ""}</span>
                </div>
                <div className="adm-act">{b.disputeOpen && <span className="pill pill--danger">Dispute open</span>}<StatusPill status={b.status} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

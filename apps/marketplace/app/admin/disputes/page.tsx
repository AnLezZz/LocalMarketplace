import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { resolveDispute } from "../actions";

export const dynamic = "force-dynamic";
type Row = { _id: string; bookingId: string; reason: string; openedBy: string; status: string; resolution?: string; at: number; customerName: string; providerName: string; serviceName?: string };

export default async function AdminDisputes({ searchParams }: { searchParams: Promise<{ status?: string; err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { status, err, ok } = await searchParams;
  const resolved = status === "resolved";
  const rows = (await fetchQuery(api.admin.listDisputes, { status: resolved ? "resolved" : "open" }, await authOpts())) as Row[];
  return (
    <AdminShell active="disputes" title="Disputes" sub="Raised by a customer or provider on an accepted booking. Read the booking, then record what was decided. Both sides are notified." err={err} ok={ok}>
      <section className="card d-card">
        <div className="adm-filters">
          <Link href="/admin/disputes" aria-current={!resolved ? "page" : undefined}>Open</Link>
          <Link href="/admin/disputes?status=resolved" aria-current={resolved ? "page" : undefined}>Resolved</Link>
        </div>
        {rows.length === 0 ? <div className="empty"><h3 className="empty__title">{resolved ? "No resolved disputes" : "No open disputes"}</h3></div> : (
          <ul className="adm-list">
            {rows.map((d) => (
              <li key={d._id} className="adm-row">
                <div className="adm-row__main">
                  <strong>{d.serviceName ?? "Booking"} · {d.customerName} → {d.providerName}</strong>
                  <span>Opened by the {d.openedBy} on {when(d.at)} · <Link href={`/admin/bookings/${d.bookingId}`}>View booking</Link></span>
                  <p className="adm-quote">{d.reason}</p>
                  {d.resolution && <p className="adm-quote"><strong>Resolution:</strong> {d.resolution}</p>}
                </div>
                {d.status === "open" && (
                  <form action={resolveDispute} className="adm-act">
                    <input type="hidden" name="id" value={d._id} /><input type="hidden" name="back" value="/admin/disputes" />
                    <input name="reason" required minLength={10} maxLength={500} placeholder="Resolution (shown to both sides)" aria-label="Resolution" />
                    <button className="btn btn--primary btn--sm">Resolve</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

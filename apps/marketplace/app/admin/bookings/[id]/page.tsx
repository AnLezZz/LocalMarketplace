import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import { requireAdminPage, when } from "../../../../lib/adminGuard";
import AdminShell from "../../../../components/dashboard/AdminShell";
import { StatusPill } from "../../../../components/Pill";
import { bookingPriceLine, bookingWindow, dollars } from "../../../../components/format";
import { cancelBooking, resolveDispute } from "../../actions";
import "../../../bookings/bookings.css";

export const dynamic = "force-dynamic";

export default async function AdminBooking({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const { err, ok } = await searchParams;
  const b = await fetchQuery(api.admin.getBooking, { id }, await authOpts());
  if (!b) notFound();
  const w = bookingWindow(b.startsAt, b.endsAt);
  const back = `/admin/bookings/${id}`;
  return (
    <AdminShell active="bookings" title="Booking" sub={`${b.serviceName ?? "Booking"} · ${b.customerName} → ${b.providerName}`} err={err} ok={ok}>
      <Link href="/admin/bookings" className="back">All bookings</Link>
      <section className="card d-card">
        <div className="d-card__head"><h2 className="d-card__title">Details</h2><StatusPill status={b.status} /></div>
        <dl className="detail">
          <div><dt>When</dt><dd>{w.day}, {w.time}</dd></div>
          <div><dt>Customer</dt><dd>{b.customerName} · {b.customerEmail}{b.customerPhone ? ` · ${b.customerPhone}` : ""}{b.shareContact ? " (agreed to share contact)" : ""}</dd></div>
          <div><dt>Provider</dt><dd><Link href={`/providers/${b.providerId}`}>{b.providerName}</Link></dd></div>
          <div><dt>Address</dt><dd>{b.address ? `${b.address}, ${b.suburb}` : "Not recorded"}</dd></div>
          {b.accessNotes && <div><dt>Access instructions</dt><dd>{b.accessNotes}</dd></div>}
          <div><dt>Job</dt><dd>{b.description}</dd></div>
          {bookingPriceLine(b, (b.endsAt - b.startsAt) / 3_600_000) && <div><dt>Price</dt><dd>{bookingPriceLine(b, (b.endsAt - b.startsAt) / 3_600_000)}{b.agreedCents !== undefined && ` · agreed ${dollars(b.agreedCents)}`}{b.quoteNote ? ` · “${b.quoteNote}”` : ""}</dd></div>}
        </dl>
        {(b.status === "requested" || b.status === "accepted") && (
          <form action={cancelBooking} className="adm-act">
            <input type="hidden" name="id" value={b._id} /><input type="hidden" name="back" value={back} />
            <input name="reason" required minLength={5} maxLength={500} placeholder="Reason (both sides are told)" aria-label="Reason for cancelling" />
            <button className="btn btn--danger btn--sm">Cancel booking</button>
          </form>
        )}
      </section>

      <section className="card d-card">
        <div className="d-card__head"><h2 className="d-card__title">Disputes</h2></div>
        {b.disputes.length === 0 ? <p className="field__hint">No disputes on this booking.</p> : (
          <ul className="adm-list">
            {b.disputes.map((d: { _id: string; status: string; reason: string; openedBy: string; resolution?: string; at: number }) => (
              <li key={d._id} className="adm-row">
                <div className="adm-row__main">
                  <strong>Opened by the {d.openedBy} <span className={`pill pill--${d.status === "open" ? "danger" : "completed"}`}>{d.status}</span></strong>
                  <span>{when(d.at)}</span>
                  <p className="adm-quote">{d.reason}</p>
                  {d.resolution && <p className="adm-quote"><strong>Resolution:</strong> {d.resolution}</p>}
                </div>
                {d.status === "open" && (
                  <form action={resolveDispute} className="adm-act">
                    <input type="hidden" name="id" value={d._id} /><input type="hidden" name="back" value={back} />
                    <input name="reason" required minLength={10} maxLength={500} placeholder="Resolution (shown to both sides)" aria-label="Resolution" />
                    <button className="btn btn--primary btn--sm">Resolve</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card d-card">
        <div className="d-card__head"><h2 className="d-card__title">History</h2></div>
        <ol className="bk__next">
          {b.events.map((e: { at: number; to: string; by: string }, i: number) => <li key={i}><b>{i + 1}</b><span><strong>{e.to}</strong>{when(e.at)} · by {e.by}</span></li>)}
        </ol>
      </section>
    </AdminShell>
  );
}

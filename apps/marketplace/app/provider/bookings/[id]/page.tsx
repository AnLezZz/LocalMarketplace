import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import { openProviderDispute, transitionBooking } from "../../actions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { attempt } from "../../../../lib/actions";
import Icon from "../../../../components/Icon";
import Avatar from "../../../../components/Avatar";
import Banner from "../../../../components/Banner";
import { StatusPill } from "../../../../components/Pill";
import { bookingPriceLine, bookingWindow, dollars } from "../../../../components/format";

import "../../../providers/[id]/booking.css";
import "../../../bookings/bookings.css";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { requested: "Requested", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled", completed: "Marked completed" };
const when = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function BookingDetails({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const b = await fetchQuery(api.bookings.getForProvider, { id }, await authOpts());
  if (!b) notFound();
  const w = bookingWindow(b.startsAt, b.endsAt);
  const back = `/provider/bookings/${id}`;
  const act = (to: "accepted" | "declined" | "completed" | "cancelled") => transitionBooking.bind(null, to, back);

  async function sendQuote(fd: FormData) {
    "use server";
    const dollarsIn = Number(fd.get("amount"));
    const r = await attempt(async () => fetchMutation(api.bookings.submitQuote, { bookingId: id, amountCents: Math.round(dollarsIn * 100), note: String(fd.get("note") ?? "") || undefined }, await authOpts()));
    revalidatePath("/provider", "layout");
    redirect(r.ok ? back : `${back}?err=${encodeURIComponent(r.message)}`);
  }
  const needsQuote = b.priceType === "quote" && b.quoteStatus !== "accepted";
  const priceLine = bookingPriceLine(b, (b.endsAt - b.startsAt) / 3_600_000);

  return (
    <div className="page page--narrow">
      <Link href="/provider#bookings" className="back"><Icon name="chevronLeft" size={20} />All bookings</Link>
      <h1 className="page__title">Booking details</h1>
      {err && <Banner tone="error">{err}</Banner>}

      <section className="card card--pad">
        <div className="booking__head">
          <Avatar name={b.customerName} />
          <div className="booking__who">
            <h2 className="booking__name">{b.customerName}</h2>
            <StatusPill status={b.status} />
          </div>
        </div>
        <dl className="booking__when">
          <div><dt className="sr-only">Date</dt><dd><Icon name="calendar" size={18} />{w.day}</dd></div>
          <div><dt className="sr-only">Time</dt><dd className="num"><Icon name="clock" size={18} />{w.time}</dd></div>
        </dl>
        {b.serviceName && <p className="booking__sub"><strong>Service:</strong> {b.serviceName}</p>}
        <dl className="detail">
          {priceLine && <div><dt>Price</dt><dd>{priceLine}{b.agreedCents !== undefined && <><br /><strong>Agreed: {dollars(b.agreedCents)}</strong></>}</dd></div>}
          {b.quoteNote && <div><dt>Quote note</dt><dd>{b.quoteNote}</dd></div>}
          <div><dt>Suburb</dt><dd>{b.suburb ?? "Not recorded"}</dd></div>
          {b.address && <div><dt>Address</dt><dd>{b.address}, {b.suburb}</dd></div>}
          {b.accessNotes && <div><dt>Access instructions</dt><dd>{b.accessNotes}</dd></div>}
          {b.contact && <div><dt>Contact</dt><dd>{b.contact.phone && <>Phone: <a href={`tel:${b.contact.phone}`}>{b.contact.phone}</a><br /></>}Email: <a href={`mailto:${b.contact.email}`}>{b.contact.email}</a></dd></div>}
        </dl>
        {b.privateHidden && <p className="note"><Icon name="info" size={18} />The full address and any access instructions are shown once you accept this request.</p>}
        {(b.status === "accepted" || b.status === "completed") && !b.contact && b.address && <p className="note"><Icon name="info" size={18} />The customer chose not to share contact details. Use the address and instructions above.</p>}
        <h3 className="card__title">Job description</h3>
        <p className="booking__desc">{b.description}</p>

        {b.status === "requested" && b.priceType === "quote" && b.quoteStatus !== "accepted" && (
          <form action={sendQuote} className="quote-box">
            <strong>{b.quoteStatus === "offered" ? "Revise your quote" : b.quoteStatus === "declined" ? "The customer declined. Send a new quote" : "Send a quote"}</strong>
            <span>The customer must accept the quote before you can accept this booking.</span>
            <div className="field"><label htmlFor="amount" className="field__label">Amount in NZD</label>
              <input id="amount" name="amount" type="number" min={1} max={50000} step="0.01" inputMode="decimal" defaultValue={b.quoteCents ? b.quoteCents / 100 : ""} required /></div>
            <div className="field"><label htmlFor="note" className="field__label">What the quote includes (optional)</label>
              <textarea id="note" name="note" rows={2} maxLength={500} defaultValue={b.quoteNote ?? ""} /></div>
            <button className="btn btn--forest">{b.quoteStatus === "offered" ? "Update quote" : "Send quote"}</button>
          </form>
        )}

        {b.dispute && (
          <div className={`quote-box${b.dispute.status === "open" ? " quote-box--warn" : ""}`}>
            <strong>{b.dispute.status === "open" ? "A dispute is open" : "Dispute resolved"}</strong>
            <span>Raised by the {b.dispute.openedBy}: {b.dispute.reason}</span>
            {b.dispute.resolution && <span><strong>Decision:</strong> {b.dispute.resolution}</span>}
            {b.dispute.status === "open" && <span>An admin is looking into it. You&apos;ll get a notification when it is resolved.</span>}
          </div>
        )}
        {(b.status === "accepted" || b.status === "completed" || b.status === "cancelled") && (!b.dispute || b.dispute.status === "resolved") && (
          <details className="rv__report">
            <summary>Report a problem with this booking</summary>
            <form action={openProviderDispute.bind(null, id)} className="form">
              <div className="field"><label htmlFor="dispute" className="field__label">What went wrong?</label>
                <textarea id="dispute" name="reason" rows={3} required minLength={10} maxLength={1000} placeholder="Tell us what happened so an admin can look into it" /></div>
              <button className="btn btn--secondary">Send to Localo</button>
            </form>
          </details>
        )}

        {(b.status === "requested" || b.status === "accepted") && (
          <form className="booking__actions">
            <input type="hidden" name="id" value={b._id} />
            {b.status === "requested" ? (
              <>
                {!needsQuote && <button className="btn btn--forest" formAction={act("accepted")}>Accept</button>}
                <button className="btn btn--danger" formAction={act("declined")}>Decline</button>
              </>
            ) : (
              <>
                <button className="btn btn--forest" formAction={act("completed")}>Mark completed</button>
                <button className="btn btn--danger" formAction={act("cancelled")}>Cancel booking</button>
              </>
            )}
          </form>
        )}
      </section>

      <section className="card card--pad" aria-labelledby="hist-h">
        <h2 id="hist-h" className="card__title">History</h2>
        <ol className="bk__next">
          {b.events.map((e: { at: number; to: string; byCustomer: boolean }, i: number) => (
            <li key={i}><b>{i + 1}</b><span><strong>{EVENT_LABEL[e.to] ?? e.to}</strong>{when.format(e.at)} · by {e.byCustomer ? b.customerName : "you"}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}

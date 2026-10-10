import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import Icon from "../../../../components/Icon";
import BookingWhere from "../../../../components/BookingWhere";
import { bookingPriceLine, bookingWindow } from "../../../../components/format";
import "../../bookings.css";
import "../../../providers/[id]/booking.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking request sent — Localo" };

/** Shown right after a request is sent. It says "request", never "confirmed": the provider still has to accept. */
export default async function Confirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await fetchQuery(api.bookings.getForCustomer, { id }, await authOpts());
  if (!b) notFound();
  // Opened later, once the provider has answered: the real status belongs on the booking page, not on a "sent" screen.
  if (b.status !== "requested") redirect(`/bookings/${id}`);
  const w = bookingWindow(b.startsAt, b.endsAt);
  const priceLine = bookingPriceLine(b, (b.endsAt - b.startsAt) / 3_600_000);
  const quote = b.priceType === "quote";

  return (
    <div className="page page--narrow bk">
      <section className="bk__card bk__done" aria-labelledby="done-h">
        <span className="bk__done-icon"><Icon name="check" size={32} /></span>
        <h1 id="done-h" className="bk__h">Booking request sent</h1>
        <p className="bk__sub"><strong>{b.providerName} hasn&apos;t accepted it yet.</strong> This is a request, not a confirmed appointment. We&apos;ll notify you as soon as they reply, and nothing is booked until they accept.</p>
        <dl className="detail bk__recap">
          <div><dt>Provider</dt><dd>{b.providerName}</dd></div>
          <div><dt>Service</dt><dd>{b.serviceName ?? "General booking"}</dd></div>
          <div><dt>Date and time</dt><dd>{w.day}<br /><span className="num">{w.time}</span> (Auckland time)</dd></div>
          <BookingWhere b={b} role="customer" />
          <div><dt>{quote ? "Price" : "Price"}</dt><dd>{priceLine}{quote && <><br /><small>{b.providerName} will send you a price. You can accept or decline it; you only pay the provider directly, and only for what you agree.</small></>}</dd></div>
        </dl>
        <div className="bk__actions">
          <Link href={`/bookings/${id}`} className="btn btn--forest bk__go">View booking</Link>
          <Link href="/" className="btn btn--secondary">Back to home</Link>
        </div>
        <ol className="bk__next">
          <li><b>1</b><span><strong>{b.providerName} reviews your request</strong>They accept or decline it{quote ? ", after sending you a quote" : ""}.</span></li>
          <li><b>2</b><span><strong>You&apos;ll be told</strong>The status updates in My bookings and in your notifications.</span></li>
          <li><b>3</b><span><strong>Meet and pay directly</strong>Localo does not collect payment.</span></li>
        </ol>
      </section>
    </div>
  );
}

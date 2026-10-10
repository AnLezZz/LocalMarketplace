import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import { transitionBooking } from "../../actions";
import Icon from "../../../../components/Icon";
import Avatar from "../../../../components/Avatar";
import Banner from "../../../../components/Banner";
import { StatusPill } from "../../../../components/Pill";
import { bookingWindow } from "../../../../components/format";

import "../../../providers/[id]/booking.css";

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
        <h3 className="card__title">Job description</h3>
        <p className="booking__desc">{b.description}</p>

        {(b.status === "requested" || b.status === "accepted") && (
          <form className="booking__actions">
            <input type="hidden" name="id" value={b._id} />
            {b.status === "requested" ? (
              <>
                <button className="btn btn--forest" formAction={act("accepted")}>Accept</button>
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

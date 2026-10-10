import Link from "next/link";
import { transitionBooking } from "../../app/provider/actions";
import Avatar from "../Avatar";
import { StatusPill } from "../Pill";
import { bookingWindow } from "../format";

/** The provider's bookings as a table (a card per booking on phones). `back` is where each action returns to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function BookingsTable({ rows, back }: { rows: any[]; back: string }) {
  return (
      <div className="d-table-wrapper">
        <table className="d-table d-table--stack">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Service</th>
              <th>Customer</th>
              <th className="d-table__th-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((b: any) => {
              const w = bookingWindow(b.startsAt, b.endsAt);
              return (
                <tr key={b._id}>
                  <td>
                    <div className="d-table__datetime">
                      <span className="d-table__date">{w.day}</span>
                      <span className="d-table__time num">{w.time}</span>
                    </div>
                  </td>
                  <td>
                    <Link href={`/provider/bookings/${b._id}`} className="d-table__service">{b.serviceName ?? b.description}</Link>
                  </td>
                  <td>
                    <div className="d-table__customer">
                      <Avatar name={b.customerName} size={28} />
                      <span>{b.customerName}</span>
                    </div>
                  </td>
                  <td className="d-table__td-right">
                    {b.status === "requested" ? (
                      <form className="d-table__actions">
                        <input type="hidden" name="id" value={b._id} />
                        {b.priceType === "quote" && b.quoteStatus !== "accepted" ? (
                          <Link href={`/provider/bookings/${b._id}`} className="btn btn--primary btn--sm">
                            {b.quoteStatus === "offered" ? "Quote sent" : "Send quote"}
                          </Link>
                        ) : (
                          <button
                            className="btn btn--primary btn--sm"
                            formAction={transitionBooking.bind(null, "accepted", back)}
                          >
                            Accept
                          </button>
                        )}
                        <button
                          className="btn btn--danger btn--sm"
                          formAction={transitionBooking.bind(null, "declined", back)}
                        >
                          Decline
                        </button>
                      </form>
                    ) : b.status === "accepted" ? (
                      <form className="d-table__actions">
                        <input type="hidden" name="id" value={b._id} />
                        <StatusPill status={b.status} />
                        <button
                          className="btn btn--secondary btn--sm"
                          formAction={transitionBooking.bind(null, "completed", back)}
                        >
                          Complete
                        </button>
                        <button
                          className="btn btn--danger btn--sm"
                          formAction={transitionBooking.bind(null, "cancelled", back)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <StatusPill status={b.status} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  );
}

import { proposeReschedule, respondReschedule, withdrawReschedule } from "../lib/rescheduleActions";

type Reschedule = { _id: string; status: "pending" | "accepted" | "declined" | "withdrawn"; proposedBy: "customer" | "provider"; newStartsAt: number; newEndsAt: number; note?: string };
const fmt = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
const LAST: Record<string, string> = { accepted: "accepted", declined: "declined", withdrawn: "withdrawn" };

/** Ask for, answer or withdraw a new time on an accepted booking. Shown to both the customer and the provider. */
export default function RescheduleBox({ role, bookingId, status, startsAt, reschedule, otherName }: {
  role: "customer" | "provider"; bookingId: string; status: string; startsAt: number; reschedule?: Reschedule; otherName: string;
}) {
  const open = status === "accepted" && startsAt > Date.now();
  const pending = reschedule?.status === "pending" ? reschedule : undefined;
  if (!open && !reschedule) return null;
  return (
    <div className="rs">
      {pending && pending.proposedBy !== role && open && (
        <div className="quote-box">
          <strong>{otherName} asked to move this to {fmt.format(pending.newStartsAt)}</strong>
          {pending.note && <span>&ldquo;{pending.note}&rdquo;</span>}
          <span>Accepting changes the booking time. Declining keeps it as it is.</span>
          <div className="booking__actions">
            <form action={respondReschedule.bind(null, role, bookingId, pending._id, true)}><button className="btn btn--forest">Accept new time</button></form>
            <form action={respondReschedule.bind(null, role, bookingId, pending._id, false)}><button className="btn btn--secondary">Keep original time</button></form>
          </div>
        </div>
      )}
      {pending && pending.proposedBy === role && (
        <div className="quote-box">
          <strong>You asked to move this to {fmt.format(pending.newStartsAt)}</strong>
          <span>Waiting for {otherName} to answer. The booking keeps its current time until they accept.</span>
          <div className="booking__actions"><form action={withdrawReschedule.bind(null, role, bookingId, pending._id)}><button className="btn btn--secondary">Withdraw request</button></form></div>
        </div>
      )}
      {!pending && open && (
        <details className="rv__report">
          <summary>Request a different time</summary>
          <form action={proposeReschedule.bind(null, role, bookingId)} className="form">
            <div className="field"><label htmlFor="when" className="field__label">New start (Auckland time)</label>
              <input id="when" name="when" type="datetime-local" required /><p className="field__hint">The length of the booking stays the same. {otherName} has to agree.</p></div>
            <div className="field"><label htmlFor="rs-note" className="field__label">Note (optional)</label>
              <input id="rs-note" name="note" maxLength={300} placeholder="Why you need to move it" /></div>
            <button className="btn btn--secondary">Send request</button>
          </form>
        </details>
      )}
      {reschedule && reschedule.status !== "pending" && <p className="field__hint">Last reschedule request ({fmt.format(reschedule.newStartsAt)}) was {LAST[reschedule.status]}.</p>}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";
import Icon from "../../../components/Icon";
import Avatar from "../../../components/Avatar";
import Banner from "../../../components/Banner";
import { StatusPill } from "../../../components/Pill";
import { bookingWindow } from "../../../components/format";
import "../bookings.css";
import "../../providers/[id]/booking.css";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { requested: "Requested", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled", completed: "Completed" };
const when = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const b = await fetchQuery(api.bookings.getForCustomer, { id }, await authOpts());
  if (!b) notFound();
  const reviewed = ((await fetchQuery(api.reviews.mine, {}, await authOpts())) as { bookingId: string }[]).some((r) => r.bookingId === id);
  const w = bookingWindow(b.startsAt, b.endsAt);

  async function cancel() {
    "use server";
    const r = await attempt(async () => fetchMutation(api.bookings.transition, { bookingId: id, to: "cancelled" }, await authOpts()));
    revalidatePath("/bookings", "layout");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/bookings/${id}?err=${encodeURIComponent(reason)}` : `/bookings/${id}`);
  }

  return (
    <div className="page page--narrow">
      <Link href="/bookings" className="back"><Icon name="chevronLeft" size={20} />My bookings</Link>
      <h1 className="page__title">Booking details</h1>
      {err && <Banner tone="error">{err}</Banner>}

      <section className="card card--pad">
        <div className="booking__head">
          <Avatar name={b.providerName} />
          <div className="booking__who">
            <h2 className="booking__name">{b.serviceName ?? b.providerName}</h2>
            {b.serviceName && <span className="booking__sub">{b.providerName}</span>}
            <StatusPill status={b.status} />
          </div>
        </div>
        <dl className="detail">
          <div><dt>Date</dt><dd>{w.day}</dd></div>
          <div><dt>Time</dt><dd className="num">{w.time}</dd></div>
          <div><dt>Address</dt><dd>{b.address ? `${b.address}, ${b.suburb}` : <em>Not recorded (made before addresses were collected)</em>}</dd></div>
          {b.accessNotes && <div><dt>Access instructions</dt><dd>{b.accessNotes}</dd></div>}
          <div><dt>Your job description</dt><dd>{b.description}</dd></div>
          <div><dt>Contact sharing</dt><dd>{b.shareContact ? `Your phone (${b.customerPhone}) and email are shared with ${b.providerName} once accepted.` : `Not shared. ${b.providerName} can see your name and the job details.`}</dd></div>
        </dl>
        {b.status === "requested" && <p className="note"><Icon name="info" size={18} />{b.providerName} will see only your suburb until they accept. Your full address and instructions are shown once they do.</p>}
        <div className="booking__actions">
          <Link href={`/providers/${b.providerId}`} className="btn btn--secondary">View provider</Link>
          {b.status === "completed" && !reviewed && <Link href={`/bookings/${id}/review`} className="btn btn--forest">Leave a review</Link>}
          {(b.status === "requested" || b.status === "accepted") && <form action={cancel}><button className="btn btn--danger">Cancel booking</button></form>}
        </div>
      </section>

      <section className="card card--pad" aria-labelledby="hist-h">
        <h2 id="hist-h" className="card__title">History</h2>
        <ol className="bk__next">
          {b.events.map((e: { at: number; to: string; byProvider: boolean }, i: number) => (
            <li key={i}><b>{i + 1}</b><span><strong>{LABEL[e.to] ?? e.to}</strong>{when.format(e.at)} · by {e.byProvider ? b.providerName : "you"}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}

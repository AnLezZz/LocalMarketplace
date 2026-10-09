import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import Link from "next/link";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import { StatusPill } from "../../components/Pill";
import { bookingWindow } from "../../components/format";

export const dynamic = "force-dynamic";

export default async function MyBookings({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const rows = await fetchQuery(api.bookings.listMine, {}, await authOpts());

  async function cancel(fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), to: "cancelled" }, await authOpts()));
    revalidatePath("/bookings");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/bookings?err=${encodeURIComponent(reason)}` : "/bookings");
  }

  return (
    <div className="page page--narrow">
      <h1 className="page__title">My bookings</h1>
      {err && <Banner tone="error">{err}</Banner>}
      {rows.length === 0 && (
        <div className="empty card">
          <span className="empty__icon"><Icon name="calendar" size={26} /></span>
          <h2 className="empty__title">No bookings yet</h2>
          <p className="empty__text">You have not requested anything yet.</p>
          <Link href="/" className="btn btn--primary">Find a pro</Link>
        </div>
      )}
      <ul className="list">
        {rows.map((b: any) => {
          const w = bookingWindow(b.startsAt, b.endsAt);
          return (
            <li className="card booking" key={b._id}>
              <div className="booking__head">
                <Avatar name={b.providerName} />
                <div className="booking__who">
                  <h2 className="booking__name">{b.providerName}</h2>
                  <StatusPill status={b.status} />
                </div>
              </div>
              <dl className="booking__when">
                <div><dt className="sr-only">Date</dt><dd><Icon name="calendar" size={18} />{w.day}</dd></div>
                <div><dt className="sr-only">Time</dt><dd className="num"><Icon name="clock" size={18} />{w.time}</dd></div>
              </dl>
              <p className="booking__desc">{b.description}</p>
              {(b.status === "requested" || b.status === "accepted") && (
                <form action={cancel} className="booking__actions">
                  <input type="hidden" name="id" value={b._id} />
                  <button className="btn btn--danger">Cancel</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

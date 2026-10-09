import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import { StatusPill } from "../../components/Pill";
import { bookingWindow } from "../../components/format";

export const dynamic = "force-dynamic";

export default async function ProviderHome({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");

  if (profile.status === "pending") {
    return (
      <div className="page page--narrow">
        <section className="card state">
          <span className="state__icon state__icon--pending"><Icon name="clock" size={28} /></span>
          <span className="pill pill--requested"><Icon name="clock" size={14} />Under review</span>
          <h1 className="state__title">Application under review</h1>
          <p className="state__text">Thanks, {profile.name}. We check every provider before they appear in search. You will be able to take requests as soon as you are approved.</p>
          <Link href="/provider/register" className="btn btn--secondary">Edit your application</Link>
        </section>
      </div>
    );
  }
  if (profile.status === "rejected") {
    return (
      <div className="page page--narrow">
        <section className="card state">
          <span className="state__icon state__icon--rejected"><Icon name="alert" size={28} /></span>
          <h1 className="state__title">Application needs changes</h1>
          <div className="reason">
            <h2 className="reason__label">Reason from our review team</h2>
            <p className="reason__text">{profile.rejectionReason}</p>
          </div>
          <Link href="/provider/register" className="btn btn--primary btn--block">Update and resubmit</Link>
        </section>
      </div>
    );
  }

  const rows = await fetchQuery(api.bookings.listIncoming, {}, opts);

  async function act(fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), to: String(fd.get("to")) }, await authOpts()));
    revalidatePath("/provider");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/provider?err=${encodeURIComponent(reason)}` : "/provider");
  }

  return (
    <div className="page page--narrow">
      <h1 className="page__title">Requests</h1>
      {err && <Banner tone="error">{err}</Banner>}
      {rows.length === 0 && (
        <div className="empty card">
          <span className="empty__icon"><Icon name="inbox" size={26} /></span>
          <h2 className="empty__title">No requests yet</h2>
          <p className="empty__text">New booking requests from customers will appear here.</p>
        </div>
      )}
      <ul className="list">
        {rows.map((b: any) => {
          const w = bookingWindow(b.startsAt, b.endsAt);
          return (
            <li className="card booking" key={b._id}>
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
              <p className="booking__desc">{b.description}</p>
              {(b.status === "requested" || b.status === "accepted") && (
                <form action={act} className="booking__actions">
                  <input type="hidden" name="id" value={b._id} />
                  {b.status === "requested" && <><button className="btn btn--primary" name="to" value="accepted">Accept</button><button className="btn btn--danger" name="to" value="declined">Decline</button></>}
                  {b.status === "accepted" && <><button className="btn btn--primary" name="to" value="completed">Mark complete</button><button className="btn btn--danger" name="to" value="cancelled">Cancel</button></>}
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

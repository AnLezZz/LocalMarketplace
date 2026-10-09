import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";

export const dynamic = "force-dynamic";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

export default async function ProviderHome({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");

  if (profile.status === "pending") {
    return (
      <>
        <h1>Application under review</h1>
        <p className="msg">Thanks, {profile.name}. We check every provider before they appear in search. You will be able to take requests as soon as you are approved.</p>
        <p><Link href="/provider/register">Edit your application</Link></p>
      </>
    );
  }
  if (profile.status === "rejected") {
    return (
      <>
        <h1>Application needs changes</h1>
        <p className="msg">{profile.rejectionReason}</p>
        <p><Link href="/provider/register">Update and resubmit</Link></p>
      </>
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
    <>
      <h1>Requests</h1>
      {err && <p className="msg">{err}</p>}
      {rows.length === 0 && <p className="muted">No requests yet.</p>}
      {rows.map((b: any) => (
        <div className="row" key={b._id}>
          <div>
            <strong>{b.customerName}</strong> · {fmt(b.startsAt)} → {fmt(b.endsAt)}
            <div className="muted">{b.description}</div>
            <div className="muted">Status: {b.status}</div>
          </div>
          <form action={act} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={b._id} />
            {b.status === "requested" && <><button name="to" value="accepted">Accept</button><button className="alt" name="to" value="declined">Decline</button></>}
            {b.status === "accepted" && <><button name="to" value="completed">Mark complete</button><button className="alt" name="to" value="cancelled">Cancel</button></>}
          </form>
        </div>
      ))}
    </>
  );
}

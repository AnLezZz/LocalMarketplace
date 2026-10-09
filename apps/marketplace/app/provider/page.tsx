import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import { Stagger, Item } from "../../components/motion";

export const dynamic = "force-dynamic";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

export default async function ProviderHome({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");

  if (profile.status === "pending") {
    return (
      <div className="wrap">
        <div className="page-h"><div className="eyebrow">Application</div><h1>Under review</h1></div>
        <div className="notice">Thanks, {profile.name}. We check every provider before they appear in search. You can take requests as soon as you are approved.</div>
        <p><Link className="back" href="/provider/register">Edit your application</Link></p>
      </div>
    );
  }
  if (profile.status === "rejected") {
    return (
      <div className="wrap">
        <div className="page-h"><div className="eyebrow">Application</div><h1>Needs changes</h1></div>
        <div className="toast err">{profile.rejectionReason}</div>
        <p><Link className="back" href="/provider/register">Update and resubmit</Link></p>
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
    <div className="wrap">
      <div className="page-h"><div className="eyebrow">Inbox</div><h1>Booking requests</h1></div>
      {err && <div className="toast err" style={{ marginBottom: 16 }}>{err}</div>}
      {rows.length === 0 && <div className="empty">No requests yet. Share your profile to get your first one.</div>}
      <Stagger>
        {rows.map((b: any) => (
          <Item key={b._id}>
            <div className="req">
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <strong>{b.customerName}</strong><span className={`status ${b.status}`}>{b.status}</span>
                </div>
                <div className="when">{fmt(b.startsAt)} → {fmt(b.endsAt)}</div>
                <div style={{ marginTop: 6 }}>{b.description}</div>
              </div>
              <form action={act} className="actions">
                <input type="hidden" name="id" value={b._id} />
                {b.status === "requested" && <><button className="btn" name="to" value="accepted">Accept</button><button className="btn ghost" name="to" value="declined">Decline</button></>}
                {b.status === "accepted" && <><button className="btn" name="to" value="completed">Mark complete</button><button className="btn ghost" name="to" value="cancelled">Cancel</button></>}
              </form>
            </div>
          </Item>
        ))}
      </Stagger>
    </div>
  );
}

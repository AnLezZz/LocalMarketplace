import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";

export const dynamic = "force-dynamic";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

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
    <>
      <h1>My bookings</h1>
      {err && <p className="msg">{err}</p>}
      {rows.length === 0 && <p className="muted">You have not requested anything yet.</p>}
      {rows.map((b: any) => (
        <div className="row" key={b._id}>
          <div>
            <strong>{b.providerName}</strong> · {fmt(b.startsAt)} → {fmt(b.endsAt)}
            <div className="muted">{b.description}</div>
            <div className="muted">Status: {b.status}</div>
          </div>
          {(b.status === "requested" || b.status === "accepted") && (
            <form action={cancel}><input type="hidden" name="id" value={b._id} /><button className="alt">Cancel</button></form>
          )}
        </div>
      ))}
    </>
  );
}

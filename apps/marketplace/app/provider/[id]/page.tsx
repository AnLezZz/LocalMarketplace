import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";

export const dynamic = "force-dynamic";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

// TEMPORARY: unauthenticated provider inbox keyed by provider id. Replace with real auth before any real users.
export default async function Inbox({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const rows = await fetchQuery(api.bookings.listForProvider, { providerId: id });

  async function act(fd: FormData) {
    "use server";
    const r = await fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), providerId: id, to: String(fd.get("to")) });
    revalidatePath(`/provider/${id}`);
    redirect(`/provider/${id}${r.ok ? "" : `?err=${encodeURIComponent(r.reason)}`}`);
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

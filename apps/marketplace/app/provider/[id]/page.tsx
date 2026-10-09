import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb, bookings, transition } from "@localhub/db";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

// TEMPORARY: unauthenticated provider inbox keyed by provider id. Replace with real auth before any real users.
export default async function Inbox({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const rows = await getDb().select().from(bookings).where(eq(bookings.providerId, id)).orderBy(desc(bookings.createdAt));

  async function act(fd: FormData) {
    "use server";
    const r = await transition(String(fd.get("id")), id, String(fd.get("to")));
    const { redirect } = await import("next/navigation");
    revalidatePath(`/provider/${id}`);
    redirect(`/provider/${id}${r.ok ? "" : `?err=${encodeURIComponent(r.reason)}`}`);
  }

  return (
    <>
      <h1>Requests</h1>
      {err && <p className="msg">{err}</p>}
      {rows.length === 0 && <p className="muted">No requests yet.</p>}
      {rows.map((b) => (
        <div className="row" key={b.id}>
          <div>
            <strong>{b.customerName}</strong> · {fmt(b.startsAt)} → {fmt(b.endsAt)}
            <div className="muted">{b.description}</div>
            <div className="muted">Status: {b.status}</div>
          </div>
          <form action={act} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={b.id} />
            {b.status === "requested" && <><button name="to" value="accepted">Accept</button><button className="alt" name="to" value="declined">Decline</button></>}
            {b.status === "accepted" && <><button name="to" value="completed">Mark complete</button><button className="alt" name="to" value="cancelled">Cancel</button></>}
          </form>
        </div>
      ))}
    </>
  );
}

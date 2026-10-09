import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { Stagger, Item } from "../../../components/motion";

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
    <div className="wrap">
      <Link href="/provider" className="back">← All businesses</Link>
      <div className="page-h" style={{ paddingTop: 0 }}><div className="eyebrow">Inbox</div><h1>Booking requests</h1></div>
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

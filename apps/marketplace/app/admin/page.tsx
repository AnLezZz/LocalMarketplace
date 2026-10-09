import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts, getMe } from "../../lib/auth";
import { attempt } from "../../lib/actions";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await getMe();
  if (me?.role !== "admin") notFound(); // Convex enforces this too; the 404 just avoids advertising the page.
  const { err } = await searchParams;
  const pending = await fetchQuery(api.admin.listPending, {}, await authOpts());

  async function decide(fd: FormData) {
    "use server";
    const decision = fd.get("decision") === "approve" ? "approve" : "reject";
    const r = await attempt(async () =>
      fetchMutation(api.admin.review, { providerId: String(fd.get("id")), decision, reason: String(fd.get("reason") ?? "") }, await authOpts()));
    revalidatePath("/admin");
    redirect(r.ok ? "/admin" : `/admin?err=${encodeURIComponent(r.message)}`);
  }

  return (
    <>
      <h1>Provider applications</h1>
      {err && <p className="msg" role="alert">{err}</p>}
      {pending.length === 0 && <p className="muted">Nothing waiting for review.</p>}
      {pending.map((p: any) => (
        <div className="row" key={p._id}>
          <div>
            <strong>{p.name}</strong> · {p.category} · {p.suburb}
            <div className="muted">${(p.rateCents / 100).toFixed(2)} {p.rateBasis === "hourly" ? "per hour" : "fixed"} · {p.ownerEmail ?? "no owner"}</div>
            <div>{p.bio}</div>
          </div>
          <form action={decide} style={{ display: "grid", gap: 8 }}>
            <input type="hidden" name="id" value={p._id} />
            <input name="reason" placeholder="Reason (required to reject)" />
            <div style={{ display: "flex", gap: 8 }}>
              <button name="decision" value="approve">Approve</button>
              <button className="alt" name="decision" value="reject">Reject</button>
            </div>
          </form>
        </div>
      ))}
    </>
  );
}

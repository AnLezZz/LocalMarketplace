import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts, getMe } from "../../lib/auth";
import { attempt } from "../../lib/actions";
import Icon from "../../components/Icon";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import { categoryMeta } from "../../components/categories";

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
      fetchMutation(api.admin.review, { providerId: String(fd.get("id")), decision, reason: String(fd.get("reason") ?? ""), submittedAt: Number(fd.get("submittedAt")) }, await authOpts()));
    revalidatePath("/admin");
    redirect(r.ok ? "/admin" : `/admin?err=${encodeURIComponent(r.message)}`);
  }

  return (
    <div className="page page--narrow">
      <h1 className="page__title">Provider applications</h1>
      {pending.length > 0 && <p className="page__sub num">{pending.length} waiting for review</p>}
      {err && <Banner tone="error">{err}</Banner>}
      {pending.length === 0 && (
        <div className="empty card">
          <span className="empty__icon"><Icon name="shield" size={26} /></span>
          <h2 className="empty__title">All caught up</h2>
          <p className="empty__text">Nothing waiting for review.</p>
        </div>
      )}
      <ul className="list">
        {pending.map((p: any) => {
          const cat = categoryMeta(p.category);
          return (
            <li className="card app" key={p._id}>
              <div className="booking__head">
                <Avatar name={p.name} />
                <div className="booking__who">
                  <h2 className="booking__name">{p.name}</h2>
                  <span className="app__meta">{cat.label} · {p.suburb}</span>
                </div>
              </div>
              <dl className="facts">
                <div><dt>Rate</dt><dd className="num">${(p.rateCents / 100).toFixed(2)} {p.rateBasis === "hourly" ? "per hour" : "fixed"}</dd></div>
                <div><dt>Owner</dt><dd className="facts__email">{p.ownerEmail ?? "no owner"}</dd></div>
              </dl>
              <p className="booking__desc">{p.bio}</p>
              <form action={decide} className="form app__form">
                <input type="hidden" name="id" value={p._id} />
                <input type="hidden" name="submittedAt" value={p.submittedAt} />
                <div className="field">
                  <label htmlFor={`reason-${p._id}`} className="field__label">Reason (required to reject)</label>
                  <input id={`reason-${p._id}`} name="reason" />
                </div>
                <div className="booking__actions">
                  <button className="btn btn--primary" name="decision" value="approve">Approve</button>
                  <button className="btn btn--danger" name="decision" value="reject">Reject</button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

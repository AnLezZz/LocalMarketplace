import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { loadProviderShell } from "../../../lib/providerDash";
import { providerSidebarItems } from "../../../lib/providerNav";
import { loadCategories } from "../../../lib/categories";
import { isOpen, STATUS_LABEL, STATUS_PILL, type MyRequest } from "../../../lib/categoryRequests";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import Banner from "../../../components/Banner";
import CategoryRequestFields from "../../../components/CategoryRequestFields";
import { replyToRequest, submitCategoryRequest } from "./actions";
import "../../providers/[id]/booking.css";

export const dynamic = "force-dynamic";
const when = (ms: number) => new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", year: "numeric" }).format(ms);

/** Where a provider asks for a category that is not in the list, and follows each request to a decision. Reactive data comes from Convex. */
export default async function CategoryRequests({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; similar?: string }> }) {
  const { err, ok, similar } = await searchParams;
  const { opts, profile } = await loadProviderShell();
  const requests = (await fetchQuery(api.categoryRequests.listMine, {}, opts)) as MyRequest[];
  const cats = await loadCategories();

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="category-requests" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems()} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Category requests</h1>
            <p className="d-header__sub">Can&apos;t find your category? Ask for it here. You can keep setting up your profile while we look at it.</p>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        {ok === "sent" && <Banner tone="success">Request sent. We will let you know what we decide.</Banner>}
        {ok === "sent" && similar && <Banner tone="info">Similar categories already exist: {similar}. We will check whether one of them fits.</Banner>}
        {ok === "replied" && <Banner tone="success">Thanks. Your answer is with us.</Banner>}

        <section className="card d-card" aria-labelledby="req-h">
          <div className="d-card__head"><h2 id="req-h" className="d-card__title">Your requests</h2>{requests.length > 0 && <span className="d-card__sub num">{requests.length}</span>}</div>
          {requests.length === 0 ? (
            <p className="muted">You haven&apos;t asked for a category yet.</p>
          ) : (
            <ul className="svc-list">
              {requests.map((r) => (
                <li key={r._id} className="svc-item" style={{ flexWrap: "wrap" }}>
                  <div className="svc-item__main">
                    <strong>{r.name}</strong>
                    <span className="svc-item__desc">{r.description}</span>
                    <span className="svc-item__meta">
                      Asked {when(r.submittedAt)} · {r.suggestedParentLabel ? `Suggested under ${r.suggestedParentLabel}` : "No parent suggested"}
                      {r.resolvedCategoryLabel && ` · Listed under ${r.resolvedCategoryLabel}`}
                    </span>
                    {r.adminNote && <span className="svc-item__desc"><strong>{r.status === "more_info" ? "We need to know: " : "From us: "}</strong>{r.adminNote}</span>}
                    {r.providerReply && r.status === "pending" && <span className="svc-item__desc"><strong>Your answer: </strong>{r.providerReply}</span>}
                    {(r.status === "approved" || r.status === "assigned") && (
                      <span className="svc-item__desc">You are now listed under {r.resolvedCategoryLabel}. Services waiting on this category stay off until you turn them on in <Link href="/provider/services">Services</Link>.</span>
                    )}
                  </div>
                  <span className={`pill pill--${STATUS_PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  {r.status === "more_info" && (
                    <form action={replyToRequest.bind(null, r._id)} className="form" style={{ flexBasis: "100%" }}>
                      <div className="field">
                        <label htmlFor={`reply-${r._id}`} className="field__label">Your answer</label>
                        <textarea id={`reply-${r._id}`} name="message" rows={3} maxLength={500} required />
                      </div>
                      <button className="btn btn--primary btn--sm">Send answer</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card d-card" aria-labelledby="new-h">
          <div className="d-card__head"><h2 id="new-h" className="d-card__title">Ask for a new category</h2></div>
          {requests.filter((r) => isOpen(r.status)).length >= 5 ? (
            <p className="muted">You have five requests open. Wait for a decision before sending another.</p>
          ) : (
            <form action={submitCategoryRequest} className="form">
              <CategoryRequestFields parents={cats.enabled} idKey="new" />
              <p className="field__hint">Check the category list first. If it already exists we will point you to it.</p>
              <button className="btn btn--primary">Send request</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

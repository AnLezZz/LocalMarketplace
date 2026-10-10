import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import { indented, loadCategories } from "../../../lib/categories";
import { isOpen, STATUS_LABEL, STATUS_PILL, type RequestStatus } from "../../../lib/categoryRequests";
import AdminShell from "../../../components/dashboard/AdminShell";
import IconPicker from "../../../components/dashboard/IconPicker";
import { approveCategoryRequest, askForMoreInfo, assignCategoryRequest, rejectCategoryRequest } from "../actions";

export const dynamic = "force-dynamic";
const back = "/admin/category-requests";
const VIEWS = [["open", "Needs a decision"], ["decided", "Decided"]] as const;

type Match = { slug: string; label: string; exact: boolean; active: boolean };
type Row = {
  _id: string; name: string; description: string; status: RequestStatus; submittedAt: number; updatedAt: number;
  providerId: string; providerName: string; ownerEmail: string | null; providerApproved: boolean;
  suggestedParentSlug?: string; suggestedParentLabel?: string; adminNote?: string; providerReply?: string; resolvedCategoryLabel?: string;
  matches: Match[]; othersAsking: number;
};

/** Category requests: providers asking for a category that is not in the list. An admin creates it, maps it to an existing one, asks a question, or declines. */
export default async function CategoryRequests({ searchParams }: { searchParams: Promise<{ view?: string; err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { view: rawView, err, ok } = await searchParams;
  const view = rawView === "decided" ? "decided" : "open";
  const opts = await authOpts();
  const [rows, cats] = await Promise.all([
    fetchQuery(api.categoryRequests.listForAdmin, { view }, opts) as Promise<Row[]>,
    loadCategories(),
  ]);
  // Where a new category can go: a main category or a subcategory (three levels deep at most).
  const parents = cats.all.filter((c) => c.depth < 2 && c.active && c._id);

  return (
    <AdminShell active="category-requests" title="Category requests" sub="Providers ask for categories that are not listed. Creating one adds it for everyone straight away; the provider is told either way." err={err} ok={ok}>
      {!cats.saved && (
        <section className="card d-card">
          <p>Save the default categories before you can create one from a request. <Link href="/admin/categories">Open categories</Link></p>
        </section>
      )}
      <section className="card d-card">
        <div className="adm-bar">
          <div className="adm-filters">
            {VIEWS.map(([k, label]) => <Link key={k} href={k === "open" ? back : `${back}?view=${k}`} aria-current={view === k ? "page" : undefined}>{label}</Link>)}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="muted">{view === "open" ? "Nothing is waiting. New requests appear here as providers send them." : "No decisions yet."}</p>
        ) : (
          <ul className="d-app-list">
            {rows.map((r) => {
              const suggestedParent = cats.all.find((c) => c.slug === r.suggestedParentSlug);
              const firstMatch = r.matches.find((m) => m.active);
              return (
                <li key={r._id} className="d-app-item">
                  <div className="d-app-item__head">
                    <div className="d-app-item__info">
                      <h3 className="d-app-item__name">{r.name} <span className={`pill pill--${STATUS_PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span></h3>
                      <div className="d-app-item__meta">
                        <span>{r.providerName}</span>
                        {r.ownerEmail && <span>{r.ownerEmail}</span>}
                        {!r.providerApproved && <span className="pill pill--sm">Application under review</span>}
                        <span>Asked {when(r.submittedAt)}</span>
                        {r.othersAsking > 0 && <span className="pill pill--sm">{r.othersAsking} other {r.othersAsking === 1 ? "provider" : "providers"} asked for this too</span>}
                      </div>
                    </div>
                  </div>

                  <p className="d-app-item__bio">{r.description}</p>
                  <p className="d-app-item__bio"><strong>Suggested parent:</strong> {r.suggestedParentLabel ?? "none"}</p>
                  {r.providerReply && <p className="d-app-item__bio"><strong>Provider replied:</strong> {r.providerReply}</p>}
                  {r.adminNote && <p className="d-app-item__bio"><strong>{r.status === "more_info" ? "You asked:" : "Message sent:"}</strong> {r.adminNote}</p>}

                  {r.matches.length > 0 && (
                    <div className="notice" role="note">
                      <strong>{r.matches.some((m) => m.exact) ? "A category with this name already exists." : "Similar categories already exist."}</strong>{" "}
                      {r.matches.map((m) => `${m.label}${m.exact ? " (same name)" : ""}${m.active ? "" : " (disabled)"}`).join(", ")}. Map the request to one of these instead of creating a copy.
                    </div>
                  )}

                  {isOpen(r.status) ? (
                    <div className="adm-act" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                      <details className="adm-more">
                        <summary className="btn btn--primary btn--sm">Create category</summary>
                        <form action={approveCategoryRequest} className="adm-manage acat__edit">
                          <input type="hidden" name="id" value={r._id} /><input type="hidden" name="back" value={back} />
                          <label className="acat__label">Name<input name="label" defaultValue={r.name} required maxLength={40} /></label>
                          <label className="acat__label">Where it goes
                            <select name="parentId" defaultValue={suggestedParent?._id ?? ""}>
                              <option value="">A main category</option>
                              {parents.map((c) => <option key={c.slug} value={c._id ?? ""}>{"– ".repeat(c.depth)}Inside {c.label}</option>)}
                            </select>
                          </label>
                          <IconPicker idKey={`n-${r._id}`} />
                          <label className="adm-check"><input type="checkbox" name="featured" /> Show on the homepage</label>
                          <label className="acat__label">Message to the provider (optional)<textarea name="note" rows={2} maxLength={500} /></label>
                          <p className="muted">The provider is listed under it. Their waiting services get the category but stay off until the provider turns them on.</p>
                          <button className="btn btn--primary btn--sm">Create and notify</button>
                        </form>
                      </details>

                      <details className="adm-more">
                        <summary className="btn btn--secondary btn--sm">Use an existing category</summary>
                        <form action={assignCategoryRequest} className="adm-manage acat__edit">
                          <input type="hidden" name="id" value={r._id} /><input type="hidden" name="back" value={back} />
                          <label className="acat__label">Existing category
                            <select name="categorySlug" defaultValue={firstMatch?.slug ?? r.suggestedParentSlug ?? ""} required>
                              <option value="" disabled>Choose a category</option>
                              {cats.enabled.map((c) => <option key={c.slug} value={c.slug}>{indented(c)}</option>)}
                            </select>
                          </label>
                          <label className="acat__label">Message to the provider (optional)<textarea name="note" rows={2} maxLength={500} /></label>
                          <button className="btn btn--primary btn--sm">Assign and notify</button>
                        </form>
                      </details>

                      <details className="adm-more">
                        <summary className="btn btn--secondary btn--sm">Ask for more information</summary>
                        <form action={askForMoreInfo} className="adm-manage acat__edit">
                          <input type="hidden" name="id" value={r._id} /><input type="hidden" name="back" value={back} />
                          <label className="acat__label">What do you need to know?<textarea name="note" rows={3} required minLength={5} maxLength={500} /></label>
                          <button className="btn btn--primary btn--sm">Send question</button>
                        </form>
                      </details>

                      <details className="adm-more">
                        <summary className="btn btn--danger btn--sm">Reject</summary>
                        <form action={rejectCategoryRequest} className="adm-manage acat__edit">
                          <input type="hidden" name="id" value={r._id} /><input type="hidden" name="back" value={back} />
                          <label className="acat__label">Reason (the provider sees this)<textarea name="note" rows={3} required minLength={5} maxLength={500} /></label>
                          <button className="btn btn--danger btn--sm">Reject and notify</button>
                        </form>
                      </details>
                    </div>
                  ) : (
                    <p className="d-app-item__bio"><strong>Outcome:</strong> {STATUS_LABEL[r.status]}{r.resolvedCategoryLabel ? ` · ${r.resolvedCategoryLabel}` : ""} · {when(r.updatedAt)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

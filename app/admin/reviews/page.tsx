import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { requireAdminPage, when } from "../../../lib/adminGuard";
import AdminShell from "../../../components/dashboard/AdminShell";
import { resolveReport, restoreReview } from "../actions";

export const dynamic = "force-dynamic";
type Report = { _id: string; reason: string; at: number; providerName: string; review: { rating: number; text: string; customerName: string } };
type Hidden = { _id: string; rating: number; text: string; customerName: string; hiddenReason?: string; providerName: string };
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requireAdminPage();
  const { err, ok } = await searchParams;
  const opts = await authOpts();
  const [reports, hidden] = await Promise.all([
    fetchQuery(api.admin.listReviewReports, {}, opts) as Promise<Report[]>,
    fetchQuery(api.admin.listHiddenReviews, {}, opts) as Promise<Hidden[]>,
  ]);
  return (
    <AdminShell active="reviews" title="Reviews" sub="Reviews are hidden, never edited, and always with a reason. A hidden review no longer counts towards the provider's rating." err={err} ok={ok}>
      <section className="card d-card" aria-labelledby="rp-h">
        <div className="d-card__head"><h2 id="rp-h" className="d-card__title">Reported by providers</h2><span className="d-card__sub num">{reports.length} open</span></div>
        {reports.length === 0 ? <div className="empty"><h3 className="empty__title">Nothing to review</h3><p className="empty__text">Reports from providers will appear here.</p></div> : (
          <ul className="adm-list">
            {reports.map((r) => (
              <li key={r._id} className="adm-row">
                <div className="adm-row__main">
                  <strong>{r.review.customerName} reviewed {r.providerName} <span className="rv__stars" aria-label={`${r.review.rating} out of 5`}>{stars(r.review.rating)}</span></strong>
                  <p className="adm-quote">{r.review.text || "(no written review)"}</p>
                  <span>Reported {when(r.at)}: “{r.reason}”</span>
                </div>
                <form className="adm-act">
                  <input type="hidden" name="id" value={r._id} /><input type="hidden" name="back" value="/admin/reviews" />
                  <input name="reason" maxLength={500} placeholder="Note (required to hide)" aria-label="Moderation note" />
                  <button className="btn btn--danger btn--sm" formAction={resolveReport.bind(null, "hide")}>Hide review</button>
                  <button className="btn btn--secondary btn--sm" formAction={resolveReport.bind(null, "dismiss")}>Keep it</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card d-card" aria-labelledby="hd-h">
        <div className="d-card__head"><h2 id="hd-h" className="d-card__title">Hidden reviews</h2><span className="d-card__sub num">{hidden.length}</span></div>
        {hidden.length === 0 ? <p className="field__hint">No hidden reviews.</p> : (
          <ul className="adm-list">
            {hidden.map((r) => (
              <li key={r._id} className="adm-row">
                <div className="adm-row__main">
                  <strong>{r.customerName} on {r.providerName} <span className="rv__stars">{stars(r.rating)}</span></strong>
                  <p className="adm-quote">{r.text || "(no written review)"}</p>
                  <span>Hidden because: {r.hiddenReason}</span>
                </div>
                <form action={restoreReview} className="adm-act"><input type="hidden" name="id" value={r._id} /><input type="hidden" name="back" value="/admin/reviews" />
                  <input name="reason" maxLength={500} placeholder="Note (optional)" aria-label="Restore note" /><button className="btn btn--secondary btn--sm">Restore</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import Banner from "../../../components/Banner";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import { api } from "../../../lib/convex";
import { loadProviderShell, type PageResult } from "../../../lib/providerDash";
import { providerSidebarItems } from "../../../lib/providerNav";
import { reportReview } from "../actions";
import "../../bookings/bookings.css";
import "../../providers/[id]/booking.css"; // .rv-list, .rv__head, .rv__stars live here

export const dynamic = "force-dynamic";

type Review = { _id: string; customerName: string; rating: number; text: string };
const PAGE = 25;

export default async function ProviderReviews({ searchParams }: { searchParams: Promise<{ err?: string; reported?: string; cursor?: string }> }) {
  const { err, reported, cursor } = await searchParams;
  const { opts, profile, summary } = await loadProviderShell();
  const result = (await fetchQuery(api.reviews.minePage, { paginationOpts: { numItems: PAGE, cursor: cursor || null } }, opts)) as PageResult<Review>;
  const avg = profile.ratingAvg && profile.ratingAvg > 0 ? profile.ratingAvg.toFixed(1) : "–";
  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="reviews" user={{ name: profile.name, subtext: "View profile", profileHref: "/provider/profile" }} items={providerSidebarItems(summary.pending)} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Reviews</h1>
            <p className="d-header__sub"><strong className="num">{avg}</strong> average from {profile.reviewCount ?? 0} {profile.reviewCount === 1 ? "review" : "reviews"}. If one is unfair or untrue, you can report it for the team to look at.</p>
          </div>
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        {reported && <Banner tone="success">Thanks, we&apos;ll look at that review and let you know.</Banner>}
        <section className="card d-card" aria-labelledby="rev-h">
          <div className="d-card__head"><h2 id="rev-h" className="d-card__title">What customers said</h2><span className="d-card__sub">Newest first</span></div>
          {result.page.length === 0 ? (
            <div className="empty"><h3 className="empty__title">No written reviews yet</h3><p className="empty__text">Reviews appear here after customers rate a completed job.</p></div>
          ) : (
            <ul className="rv-list">
              {result.page.map((r) => (
                <li key={r._id} className="rv">
                  <div className="rv__head"><strong>{r.customerName}</strong><span className="rv__stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></div>
                  {r.text && <p>{r.text}</p>}
                  <details className="rv__report">
                    <summary>Report this review</summary>
                    <form action={reportReview} className="adm-act">
                      <input type="hidden" name="id" value={r._id} />
                      <input name="reason" required minLength={10} maxLength={500} placeholder="What is wrong with it?" aria-label="Why are you reporting this review?" />
                      <button className="btn btn--secondary btn--sm">Send report</button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {(cursor || !result.isDone) && (
            <nav className="pager" aria-label="Pages">
              {cursor ? <Link href="/provider/reviews" className="btn btn--secondary btn--sm">← Back to the start</Link> : <span />}
              {!result.isDone && <Link href={`/provider/reviews?cursor=${encodeURIComponent(result.continueCursor)}`} className="btn btn--secondary btn--sm" rel="next">Older →</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import Icon from "../../../../components/Icon";
import ReviewText from "../../../../components/ReviewText";
import "./reviews.css";

export const dynamic = "force-dynamic";
type Review = { _id: string; customerName: string; rating: number; text: string; at: number };
type Found = { rows: Review[]; total: number; capped: boolean; breakdown: number[] };
const PAGE = 6;
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/** All of one provider's written reviews: the rating summary beside the reviews, paged with arrows. The profile only shows the latest three. */
export default async function ProviderReviews({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Math.floor(Number((await searchParams).page)) || 1);
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();
  const result = (await fetchQuery(api.reviews.forProviderPage, { providerId: id as never, offset: (page - 1) * PAGE, limit: PAGE })) as Found;
  const pages = Math.max(1, Math.ceil(result.total / PAGE));
  const hrefFor = (n: number) => (n > 1 ? `/providers/${id}/reviews?page=${n}` : `/providers/${id}/reviews`);
  if (page > pages) redirect(hrefFor(pages)); // a link to a page that no longer exists lands on the last one
  const profile = `/providers/${id}`;
  const rounded = Math.round(p.ratingAvg);

  return (
    <div className="page page--wide rvp">
      <div className="rvp__card">
        <header className="rvp__head">
          <h1 className="rvp__title">Reviews</h1>
          <Link href={profile} className="rvp__close" aria-label={`Close, back to ${p.name}`}><Icon name="x" size={24} /></Link>
        </header>

        <div className="rvp__grid">
          <aside className="rvp__summary" aria-label="Rating summary">
            <p className="rvp__for">{p.name}</p>
            <div className="rvp__score">
              <span className="rvp__avg num">{p.reviewCount > 0 ? p.ratingAvg.toFixed(1) : "–"}</span>
              <div>
                <span className="rvp__stars" role="img" aria-label={`${p.ratingAvg.toFixed(1)} out of 5`}>{stars(rounded)}</span>
                <span className="rvp__based">based on {p.reviewCount} {p.reviewCount === 1 ? "review" : "reviews"}</span>
              </div>
            </div>
            {result.total > 0 && (
              <ul className="rvp__bars" aria-label="Reviews by rating">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = result.breakdown[n - 1];
                  return (
                    <li key={n}>
                      <span className="num">{n}★</span>
                      <span className="rvp__bar" aria-hidden="true"><span style={{ width: `${(count / result.total) * 100}%` }} /></span>
                      <span className="num rvp__count">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section className="rvp__list" aria-label="Reviews">
            {result.rows.length === 0 ? (
              <p className="rvp__empty">No written reviews yet. Customers can review a job once it is completed.</p>
            ) : (
              <ul>
                {result.rows.map((r) => (
                  <li key={r._id} className="rvp__item">
                    <div className="rvp__who"><strong>{r.customerName}</strong><time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" })}</time></div>
                    <span className="rvp__stars" role="img" aria-label={`${r.rating} out of 5`}>{stars(r.rating)}</span>
                    {r.text && <ReviewText text={r.text} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {pages > 1 && (
          <nav className="rvp__pager" aria-label="Pages of reviews">
            <span className="num rvp__where">Page {page} of {pages}</span>
            {page > 1 ? <Link href={hrefFor(page - 1)} className="rvp__arrow" aria-label="Previous page" rel="prev"><Icon name="chevronLeft" size={24} /></Link> : <span className="rvp__arrow rvp__arrow--off" aria-hidden="true"><Icon name="chevronLeft" size={24} /></span>}
            {page < pages ? <Link href={hrefFor(page + 1)} className="rvp__arrow" aria-label="Next page" rel="next"><Icon name="chevronRight" size={24} /></Link> : <span className="rvp__arrow rvp__arrow--off" aria-hidden="true"><Icon name="chevronRight" size={24} /></span>}
          </nav>
        )}
      </div>
    </div>
  );
}

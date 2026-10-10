import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import Icon from "../../../../components/Icon";
import { Rating } from "../../../../components/Pill";
import { redirect } from "next/navigation";
import PageNav from "../../../../components/PageNav";
import "../booking.css";

const PAGE = 10;
export const dynamic = "force-dynamic";
type Review = { _id: string; customerName: string; rating: number; text: string; at: number };

/** Every written review of one provider, newest first, a page at a time. The profile only shows the latest few. */
export default async function ProviderReviews({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Math.floor(Number(((await searchParams).page)) || 1));
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();
  const result = (await fetchQuery(api.reviews.forProviderPage, { providerId: id as never, offset: (page - 1) * PAGE, limit: PAGE })) as { rows: Review[]; total: number; capped: boolean };
  const pages = Math.max(1, Math.ceil(result.total / PAGE));
  const hrefFor = (n: number) => (n > 1 ? `/providers/${id}/reviews?page=${n}` : `/providers/${id}/reviews`);
  if (page > pages) redirect(hrefFor(pages)); // a link to a page that no longer exists lands on the last one

  return (
    <div className="page page--narrow bk">
      <Link href={`/providers/${id}`} className="back"><Icon name="chevronLeft" size={20} />Back to {p.name}</Link>
      <h1 className="page__title">Reviews of {p.name}</h1>
      <p className="page__sub"><Rating avg={p.ratingAvg} count={p.reviewCount} />{pages > 1 && <span> · page {page} of {pages}</span>}</p>
      <section className="bk__card" aria-label="Reviews">
        {result.rows.length === 0 ? (
          <p className="bk__sub">No written reviews yet. Customers can review a job once it is completed.</p>
        ) : (
          <ul className="rv-list">
            {result.rows.map((r) => (
              <li key={r._id} className="rv">
                <div className="rv__head"><strong>{r.customerName}</strong><span className="rv__stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" })}</time></div>
                {r.text && <p>{r.text}</p>}
              </li>
            ))}
          </ul>
        )}
        <PageNav page={page} pages={pages} hrefFor={hrefFor} label="Pages of reviews" />
      </section>
    </div>
  );
}

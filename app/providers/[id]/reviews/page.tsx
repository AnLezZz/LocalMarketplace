import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import Icon from "../../../../components/Icon";
import { Rating } from "../../../../components/Pill";
import AdminPager from "../../../../components/dashboard/AdminPager";
import { loadAdminPage, type AdminPage } from "../../../../lib/adminPage";
import "../booking.css";

export const dynamic = "force-dynamic";
type Review = { _id: string; customerName: string; rating: number; text: string; at: number };

/** Every written review of one provider, newest first, a page at a time. The profile only shows the latest few. */
export default async function ProviderReviews({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { id } = await params;
  const { cursor } = await searchParams;
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();
  const result = await loadAdminPage<Review>(`/providers/${id}/reviews`, cursor, async (c) => (await fetchQuery(api.reviews.forProvider, { providerId: id as never, paginationOpts: { numItems: 20, cursor: c } })) as unknown as AdminPage<Review>);

  return (
    <div className="page page--narrow bk">
      <Link href={`/providers/${id}`} className="back"><Icon name="chevronLeft" size={20} />Back to {p.name}</Link>
      <h1 className="page__title">Reviews of {p.name}</h1>
      <p className="page__sub"><Rating avg={p.ratingAvg} count={p.reviewCount} /></p>
      <section className="bk__card" aria-label="Reviews">
        {result.page.length === 0 ? (
          <p className="bk__sub">{cursor ? "No more reviews." : "No written reviews yet. Customers can review a job once it is completed."}</p>
        ) : (
          <ul className="rv-list">
            {result.page.map((r) => (
              <li key={r._id} className="rv">
                <div className="rv__head"><strong>{r.customerName}</strong><span className="rv__stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" })}</time></div>
                {r.text && <p>{r.text}</p>}
              </li>
            ))}
          </ul>
        )}
        <AdminPager base={`/providers/${id}/reviews`} cursor={cursor} nextLabel="Show more reviews →" result={result} />
      </section>
    </div>
  );
}

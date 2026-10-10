import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api, CATEGORIES } from "../../lib/convex";
import Icon from "../../components/Icon";
import ProviderPhoto from "../../components/ProviderPhoto";
import { Rating } from "../../components/Pill";
import { categoryMeta } from "../../components/categories";
import { rate } from "../../components/format";
import type { ProviderSummary } from "../../components/ProviderCard";
import "./search.css";

export const dynamic = "force-dynamic";

type Params = { q?: string; suburb?: string; category?: string; max?: string; rating?: string; sort?: string };

const SORTS: Record<string, [string, (a: ProviderSummary, b: ProviderSummary) => number]> = {
  best: ["Best match", (a, b) => b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount],
  low: ["Price: low to high", (a, b) => a.rateCents - b.rateCents],
  high: ["Price: high to low", (a, b) => b.rateCents - a.rateCents],
  reviews: ["Most reviews", (a, b) => b.reviewCount - a.reviewCount],
};

export default async function Search({ searchParams }: { searchParams: Promise<Params> }) {
  const { q, suburb, category, max, rating, sort } = await searchParams;
  const all = (await fetchQuery(api.providers.list, { category: category || undefined, suburb: suburb || undefined, q: q || undefined })) as ProviderSummary[];
  const tags = new Map<string, string[]>();
  for (const t of (await fetchQuery(api.services.listPublic, {})) as { providerId: string; name: string }[]) tags.set(t.providerId, [...(tags.get(t.providerId) ?? []), t.name]);
  const maxCents = Number(max) * 100, minRating = Number(rating);
  const sortKey = sort && SORTS[sort] ? sort : "best";
  const list = all
    .filter((p) => (!max || p.rateCents <= maxCents) && (!rating || (p.reviewCount > 0 && p.ratingAvg >= minRating)))
    .sort(SORTS[sortKey][1]);

  return (
    <div className="page page--wide srch">
      <form className="srch__form" role="search" action="/search">
        <div className="srch__bar">
          <label className="srch__field srch__field--main">
            <span className="sr-only">Keyword</span>
            <Icon name="search" size={18} />
            <input name="q" placeholder="What do you need help with?" defaultValue={q} autoComplete="off" />
          </label>
          <label className="srch__field">
            <span className="sr-only">Suburb</span>
            <Icon name="pin" size={18} />
            <input name="suburb" placeholder="Suburb" defaultValue={suburb} autoComplete="address-level2" />
          </label>
          <button className="srch__go" aria-label="Search">
            <Icon name="search" size={20} />
          </button>

          <div className="srch__chips">
            <label className="srch__chip">
              <Icon name="filter" size={16} />
              <span className="sr-only">Category</span>
              <select name="category" defaultValue={category ?? ""}>
                <option value="">All filters</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{categoryMeta(c).label}</option>)}
              </select>
            </label>
            <label className="srch__chip">
              <span className="sr-only">Price</span>
              <select name="max" defaultValue={max ?? ""}>
                <option value="">Price</option>
                {[50, 75, 100, 150].map((n) => <option key={n} value={n}>Up to ${n}</option>)}
              </select>
            </label>
            <label className="srch__chip">
              <span className="sr-only">Rating</span>
              <select name="rating" defaultValue={rating ?? ""}>
                <option value="">Rating</option>
                {[4, 4.5].map((n) => <option key={n} value={n}>{n}+ stars</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="srch__count">
          <span><span className="num">{list.length}</span> {list.length === 1 ? "provider" : "providers"} found</span>
          <label className="srch__sort">
            <span>Sort by</span>
            <select name="sort" defaultValue={sortKey}>
              {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
        </div>
        {(q || suburb || category || max || rating) && <Link href="/search" className="lp-link srch__clear">Clear filters</Link>}
      </form>

      {list.length === 0 ? (
        <div className="empty card">
          <span className="empty__icon"><Icon name="search" size={26} /></span>
          <h2 className="empty__title">No pros match that search</h2>
          <p className="empty__text">Try another suburb, keyword or filter.</p>
          <Link href="/search" className="btn btn--secondary">Clear filters</Link>
        </div>
      ) : (
        <ul className="srch__list">
          {list.map((p) => {
            const price = rate(p.rateCents, p.rateBasis);
            const cat = categoryMeta(p.category);
            return (
              <li key={p._id} className="srch__item">
                <ProviderPhoto name={p.name} photo={p.photo} size={96} />
                <div className="srch__info">
                  <h2 className="srch__name">{p.name}</h2>
                  <Rating avg={p.ratingAvg} count={p.reviewCount} />
                  <div className="srch__meta"><Icon name="pin" size={14} />{p.suburb}, Auckland</div>
                  <div className="srch__tags">
                    {(tags.get(p._id) ?? [cat.label]).slice(0, 3).map((n) => <span key={n} className="srch__tag">{n}</span>)}
                  </div>
                </div>
                <div className="srch__cta">
                  <span className="srch__price">From <strong className="num">{price.amount}</strong> {price.unit.trim()}</span>
                  <Link href={`/providers/${p._id}`} className="btn btn--forest btn--sm">View profile</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

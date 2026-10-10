import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../lib/convex";
import { indented, loadCategories, loadLocations, metaIn } from "../lib/categories";
import SuburbOptions from "./SuburbOptions";
import PlaceInput from "./PlaceInput";
import Icon from "./Icon";
import ProviderPhoto from "./ProviderPhoto";
import { Rating } from "./Pill";
import { rate } from "./format";
import type { ProviderSummary } from "./ProviderCard";
import FavouriteButton from "./FavouriteButton";
import { authOpts } from "../lib/auth";
import "../app/search/search.css";

export type SearchParams = { q?: string; suburb?: string; where?: string; place?: string; category?: string; max?: string; rating?: string; sort?: string };
type Place = { _id: string; name: string; kind: string; context: string };
type Resolved = { status: "unrecognised" } | { status: "not_launched"; name: string } | { status: "ambiguous"; options: Place[] } | { status: "ok"; place: Place };

const SORTS: Record<string, [string, (a: ProviderSummary, b: ProviderSummary) => number]> = {
  best: ["Best match", (a, b) => b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount],
  low: ["Price: low to high", (a, b) => a.rateCents - b.rateCents],
  high: ["Price: high to low", (a, b) => b.rateCents - a.rateCents],
  reviews: ["Most reviews", (a, b) => b.reviewCount - a.reviewCount],
};

/**
 * The provider search: keyword, location, category, price and rating filters, sorting, and the result list with its empty states.
 * Used by /search and by every category page (which locks the category and keeps its own path).
 */
export default async function ProviderSearch({ params, basePath, lockedCategory }: { params: SearchParams; basePath: string; lockedCategory?: string }) {
  const { q, suburb: legacySuburb, where: whereParam, place, max, rating, sort } = params;
  const category = lockedCategory ?? params.category;
  const cats = await loadCategories();
  const places = await loadLocations();
  const where = (whereParam ?? legacySuburb ?? "").trim();
  const suburb = where; // what the box shows and the links carry
  // With geography imported the place is resolved on the server; otherwise the old suburb text filter applies.
  const resolved: Resolved | null = places.places && (where || place)
    ? ((await fetchQuery(api.locations.resolveSearchPlace, { name: where || undefined, placeId: place || undefined })) as Resolved)
    : null;
  const placeId = resolved?.status === "ok" ? resolved.place._id : undefined;
  const find = async (extra: { category?: string; q?: string }) => (resolved && !placeId ? [] : ((await fetchQuery(api.providers.list, { ...extra, ...(placeId ? { placeId } : { suburb: where || undefined }) })) as ProviderSummary[]));
  const all = await find({ category: category || undefined, q: q || undefined });
  const atPlace = placeId && all.length === 0 && (category || q) ? await find({}) : all;
  const saved = new Set((await fetchQuery(api.favourites.mineIds, {}, await authOpts())) as string[]);
  const tags = new Map<string, string[]>();
  for (const t of (await fetchQuery(api.services.listPublic, {})) as { providerId: string; name: string }[]) tags.set(t.providerId, [...(tags.get(t.providerId) ?? []), t.name]);
  // The heart returns here with the same keyword and filters.
  const here = `${basePath}${Object.entries({ q, where: suburb, place: placeId, category, max, rating, sort }).filter(([, v]) => v).length ? "?" + new URLSearchParams(Object.entries({ q, where: suburb, place: placeId, category, max, rating, sort }).filter(([, v]) => v) as [string, string][]).toString() : ""}`;
  const maxCents = Number(max) * 100, minRating = Number(rating);
  const sortKey = sort && SORTS[sort] ? sort : "best";
  const list = all
    .filter((p) => (!max || p.rateCents <= maxCents) && (!rating || (p.reviewCount > 0 && p.ratingAvg >= minRating)))
    .sort(SORTS[sortKey][1]);

  return (
    <div className="page page--wide srch">
      <SuburbOptions suburbs={places.suburbs} />
      <form className="srch__form" role="search" action={basePath}>
        <div className="srch__bar">
          <label className="srch__field srch__field--main">
            <span className="sr-only">Keyword</span>
            <Icon name="search" size={18} />
            <input name="q" placeholder="What do you need help with?" defaultValue={q} autoComplete="off" />
          </label>
          <div className="srch__field">
            <Icon name="pin" size={18} />
            {places.places
              ? <PlaceInput name="where" idName="place" label="Where" placeholder="Region or district" defaultValue={where} defaultId={placeId ?? ""} />
              : <input name="suburb" aria-label="Suburb" placeholder="Suburb" defaultValue={suburb} autoComplete="address-level2" list="suburb-options" />}
          </div>
          <button className="srch__go" aria-label="Search">
            <Icon name="search" size={20} />
          </button>

          <div className="srch__chips">
            {!lockedCategory && (
              <label className="srch__chip">
                <Icon name="filter" size={16} />
                <span className="sr-only">Category</span>
                <select name="category" defaultValue={category ?? ""}>
                  <option value="">All categories</option>
                  {cats.enabled.map((c) => <option key={c.slug} value={c.slug}>{indented(c)}</option>)}
                </select>
              </label>
            )}
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
        {(q || suburb || (!lockedCategory && category) || max || rating) && <Link href={basePath} className="lp-link srch__clear">Clear filters</Link>}
      </form>

      {list.length === 0 ? (
        <div className="empty card">
          <span className="empty__icon"><Icon name={resolved ? "pin" : "search"} size={26} /></span>
          {(() => {
            const catLabel = category ? metaIn(cats.all, category).label.toLowerCase() : "";
            if (lockedCategory && !resolved && !q && !max && !rating) return <><h2 className="empty__title">No {metaIn(cats.all, lockedCategory).label} providers yet</h2><p className="empty__text">Nobody has listed this category. Try one of the options above, or browse everything else.</p><Link href="/categories" className="btn btn--forest">Browse all categories</Link></>;
            if (resolved?.status === "unrecognised") return <><h2 className="empty__title">We don&apos;t recognise &ldquo;{where}&rdquo;</h2><p className="empty__text">Check the spelling, or try a nearby suburb, a city or a region.</p></>;
            if (resolved?.status === "not_launched") return <><h2 className="empty__title">Localo hasn&apos;t launched in {resolved.name} yet</h2><p className="empty__text">We&apos;re not taking bookings there yet. Try a nearby area.</p></>;
            if (resolved?.status === "ambiguous") return <><h2 className="empty__title">Which {where}?</h2><p className="empty__text">More than one place has that name.</p>
              <ul className="srch__choices">{resolved.options.map((o) => <li key={o._id}><Link href={`${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(category && !lockedCategory ? { category } : {}), where: o.name, place: o._id }).toString()}`}><strong>{o.name}</strong><span className="field__hint">{o.context || "Region"}</span></Link></li>)}</ul></>;
            if (resolved?.status === "ok" && atPlace.length === 0) return <><h2 className="empty__title">No providers serve {resolved.place.name} yet</h2><p className="empty__text">Localo is open there, but nobody has added it as a service area. Try a wider area, such as the region.</p></>;
            if (resolved?.status === "ok" && all.length === 0) return <><h2 className="empty__title">No {catLabel ? `${catLabel} ` : ""}providers serve {resolved.place.name}{q ? ` for “${q}”` : ""}</h2><p className="empty__text">{atPlace.length} {atPlace.length === 1 ? "provider serves" : "providers serve"} {resolved.place.name} in other categories. Try removing the category or keyword.</p></>;
            if (resolved?.status === "ok") return <><h2 className="empty__title">Your filters exclude everyone</h2><p className="empty__text">{all.length} {all.length === 1 ? "provider serves" : "providers serve"} {resolved.place.name}, but none match the price or rating you chose.</p></>;
            return <><h2 className="empty__title">No pros match that search</h2><p className="empty__text">Try another suburb, keyword or filter.</p></>;
          })()}
          {!(lockedCategory && !resolved && !q && !max && !rating) && <Link href={basePath} className="btn btn--secondary">Clear filters</Link>}
        </div>
      ) : (
        <ul className="srch__list">
          {list.map((p) => {
            const price = rate(p.rateCents, p.rateBasis);
            const cat = metaIn(cats.all, p.category);
            return (
              <li key={p._id} className="srch__item">
                <ProviderPhoto name={p.name} photo={p.photo} category={p.category} size={96} />
                <div className="srch__info">
                  <h2 className="srch__name">{p.name}</h2>
                  <Rating avg={p.ratingAvg} count={p.reviewCount} />
                  <div className="srch__meta"><Icon name="pin" size={14} />{p.suburb}, {places.city}</div>
                  <div className="srch__tags">
                    {(tags.get(p._id) ?? [cat.label]).slice(0, 3).map((n) => <span key={n} className="srch__tag">{n}</span>)}
                  </div>
                </div>
                <div className="srch__cta">
                  <FavouriteButton providerId={p._id} saved={saved.has(p._id)} back={here} name={p.name} />
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

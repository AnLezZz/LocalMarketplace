import Link from "next/link";
import Image from "next/image";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "../lib/convex";
import { loadCategories, loadLocations, metaIn } from "../lib/categories";
import { getMe } from "../lib/auth";
import Icon from "../components/Icon";
import PlaceInput from "../components/PlaceInput";
import FeaturedCategories from "../components/FeaturedCategories";
import ProviderPhoto from "../components/ProviderPhoto";
import { Rating } from "../components/Pill";
import { type ProviderSummary } from "../components/ProviderCard";
import { rate, partOfDay } from "../components/format";

export const dynamic = "force-dynamic";

type Params = { category?: string; suburb?: string; q?: string };

/** Home URL with the given params, dropping empty ones. */
function href(p: Params) {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  if (p.suburb) s.set("suburb", p.suburb);
  if (p.category) s.set("category", p.category);
  const qs = s.toString();
  return qs ? `/?${qs}` : "/";
}

const SHOWN = 8;

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const { category, suburb, q } = await searchParams;
  const cats = await loadCategories();
  const places = await loadLocations();
  const featuredCats = await preloadQuery(api.categories.featured, {});
  const filtered = !!(category || suburb || q);
  // The homepage shows the best few; the full, paged list is /search. The total is the real number of matches.
  const search = (extra: { category?: string; suburb?: string; q?: string }, limit: number) =>
    fetchQuery(api.providers.search, { ...extra, offset: 0, limit }) as Promise<{ rows: ProviderSummary[]; total: number; capped: boolean }>;
  const [found, anyone, me] = await Promise.all([
    search({ category: category || undefined, suburb: suburb || undefined, q: q || undefined }, SHOWN),
    filtered ? search({}, 1) : null,
    getMe(),
  ]);
  const list = found.rows;
  const everyone = { length: (anyone ?? found).total };

  const firstName = me?.name?.trim().split(/\s+/)[0];
  const greeting = `Good ${partOfDay()}${firstName ? `, ${firstName}` : ""}.`;
  const heading = filtered
    ? `${found.total} ${found.total === 1 ? "pro" : "pros"}${category ? ` for ${metaIn(cats.all, category).label.toLowerCase()}` : ""}${suburb ? ` near ${suburb}` : ""}`
    : `${found.total} ${found.total === 1 ? "pro" : "pros"}`;

  return (
    <div className="page page--wide lp">
      <section className="lp-hero">
        <Image src="/images/hero_gardener.jpg" alt="" fill priority sizes="(min-width: 1080px) 1032px, 100vw" className="lp-hero__img" />
        <div className="lp-hero__body">
          <h1 className="lp-hero__title">{me ? greeting : "Good help."}<br />{me ? "What needs doing?" : "Right around the corner."}</h1>
          <p className="lp-hero__sub">Find trusted local people for everyday jobs.</p>
          <form className="lp-search" role="search" action="/search">
            {category && <input type="hidden" name="category" value={category} />}
            <label className="lp-search__field">
              <span className="sr-only">Keyword</span>
              <Icon name="search" size={18} />
              <input name="q" placeholder="What do you need help with?" defaultValue={q} autoComplete="off" />
            </label>
            <div className="lp-search__field">
              <Icon name="pin" size={18} />
              {places.places
                ? <PlaceInput name="where" idName="place" label="Where" placeholder="Region or district" defaultValue={suburb} />
                : <input name="suburb" aria-label="Suburb" placeholder="Your suburb" defaultValue={suburb} autoComplete="address-level2" />}
            </div>
            <button className="btn btn--forest">Search</button>
          </form>
        </div>
      </section>

      <FeaturedCategories preloaded={featuredCats} />

      <section className="lp-section" id="pros" aria-labelledby="pros-h">
        <div className="lp-section__head">
          <h2 id="pros-h" className="lp-h2">{filtered ? heading : "People worth knowing"}</h2>
          {filtered ? <Link href="/" className="lp-link">Clear filters</Link> : <Link href="/search" className="lp-link">View all</Link>}
        </div>
        <p className="lp-section__sub">Trusted locals. Real work.</p>
        {list.length === 0 ? (
          <div className="empty card">
            <span className="empty__icon"><Icon name="search" size={26} /></span>
            {everyone.length === 0 ? (
              <>
                <h3 className="empty__title">No providers yet</h3>
                <p className="empty__text">No providers found. If this is a fresh database, run <code>pnpm convex:seed</code>.</p>
              </>
            ) : (
              <>
                <h3 className="empty__title">No pros match that search</h3>
                <p className="empty__text">Try another suburb or keyword, or browse every category.</p>
                <Link href="/" className="btn btn--secondary">Clear filters</Link>
              </>
            )}
          </div>
        ) : (
          <div className="lp-pros">
            {list.map((p) => {
              const price = rate(p.rateCents, p.rateBasis);
              return (
                <Link key={p._id} href={`/providers/${p._id}`} className="lp-pro">
                  <div className="lp-pro__photo">
                    <ProviderPhoto name={p.name} photo={p.photo} category={p.category} fill />
                    <span className="lp-pro__rating"><Rating avg={p.ratingAvg} count={p.reviewCount} /></span>
                  </div>
                  <h3 className="lp-pro__name">{p.name}</h3>
                  <div className="lp-pro__meta">{metaIn(cats.all, p.category).label}</div>
                  <div className="lp-pro__meta"><Icon name="pin" size={13} /> {p.suburb}</div>
                  <div className="lp-pro__price">From <strong className="num">{price.amount}</strong> {price.unit.trim()}</div>
                </Link>
              );
            })}
          </div>
        )}
        {found.total > list.length && (
          <p className="lp-more"><Link href={`/search${filtered ? `?${new URLSearchParams(Object.entries({ q, category, where: suburb }).filter(([, v]) => v) as [string, string][])}` : ""}`} className="btn btn--secondary">See all {found.total}{found.capped ? "+" : ""} providers</Link></p>
        )}
      </section>

      <section className="lp-section" id="how-it-works" aria-labelledby="how-h">
        <h2 id="how-h" className="lp-h2">How it works</h2>
        <ol className="lp-steps">
          {([
            ["search", "1. Find", "Search for services in your area."],
            ["calendar", "2. Book", "Choose a provider and request a time."],
            ["user", "3. Get it done", "Meet in person and pay directly."],
          ] as const).map(([icon, title, text]) => (
            <li key={title} className="lp-step">
              <span className="lp-step__icon"><Icon name={icon} size={22} /></span>
              <div><strong>{title}</strong><span>{text}</span></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-cta">
        <div className="lp-cta__body">
          <h2 className="lp-cta__title">Support local.<br />Get more done.</h2>
          <p>From home projects to everyday help, find trusted people in your neighbourhood.</p>
          <Link href="/#services" className="btn btn--cream">Browse services</Link>
        </div>
        <Image src="/images/hero_gardener.jpg" alt="" fill sizes="(min-width: 720px) 50vw, 0px" className="lp-cta__img" />
      </section>
    </div>
  );
}

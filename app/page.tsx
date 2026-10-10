import Link from "next/link";
import Image from "next/image";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "../lib/convex";
import { loadCategories, loadLocations, metaIn } from "../lib/categories";
import { authOpts, getMe } from "../lib/auth";
import Icon from "../components/Icon";
import PlaceInput from "../components/PlaceInput";
import FeaturedCategories from "../components/FeaturedCategories";
import ProviderPhoto from "../components/ProviderPhoto";
import ProviderCarousel from "../components/ProviderCarousel";
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

const FAQ: [string, string][] = [
  ["How does booking work?", "You pick a service and a time from the provider's real availability and send a request. The provider accepts or declines. Nothing is confirmed until they accept, and a pending request never holds the slot."],
  ["Do I pay through Localo?", "No. Localo doesn't collect, hold or guarantee payment. You pay your provider directly."],
  ["What if a service has no fixed price?", "Some services are quoted. The provider sends you a price, you accept or decline it, and only then can they accept the booking."],
  ["Can I cancel or change the time?", "Yes. You can cancel from My bookings, or ask for a different time. A new time only takes effect once the other side agrees."],
  ["Who can see my address?", "A provider only sees your suburb while your request is open. The full address and any access notes appear after they accept."],
  ["How are providers checked?", "Every provider applies and an admin approves them before they appear. That is a review of their application, not a licence or insurance check, so if a job needs a licensed tradesperson, ask the provider."],
];

const SHOWN = 12; // a single scrolling row: the best twelve
/**
 * The featured providers, the popular chips and the Near-you row stay hidden (the launch cards show instead) until this many real,
 * approved providers exist. Demo listings without an owner don't count. Lower it if you want them back sooner.
 */
const FEATURED_MIN = 6;

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const { category, suburb, q } = await searchParams;
  const cats = await loadCategories();
  const places = await loadLocations();
  const featuredCats = await preloadQuery(api.categories.featured, {});
  const filtered = !!(category || suburb || q);
  // The homepage shows the best few; the full, paged list is /search. The total is the real number of matches.
  const search = (extra: { category?: string; suburb?: string; q?: string }, limit: number) =>
    fetchQuery(api.providers.search, { ...extra, offset: 0, limit }) as Promise<{ rows: ProviderSummary[]; total: number; capped: boolean }>;
  const [found, anyone, me, recentReviews, real] = await Promise.all([
    search({ category: category || undefined, suburb: suburb || undefined, q: q || undefined }, SHOWN),
    filtered ? search({}, 1) : null,
    getMe(),
    fetchQuery(api.reviews.recent, { limit: 6 }) as Promise<{ _id: string; customerName: string; rating: number; text: string; at: number; providerId: string; providerName: string }[]>,
    fetchQuery(api.providers.realCount, {}) as Promise<number>,
  ]);
  const list = found.rows;
  const everyone = { length: (anyone ?? found).total };
  const noProviders = !filtered && real < FEATURED_MIN; // not enough real providers yet: show the launch cards instead

  // Popular: the categories most of the featured providers are listed under, so every link is known to lead to someone.
  const tally = new Map<string, number>();
  for (const p of list) tally.set(p.category, (tally.get(p.category) ?? 0) + 1);
  const popular = noProviders ? [] : [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([slug]) => ({ slug, label: metaIn(cats.all, slug).label }));

  const card = (p: ProviderSummary) => {
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
  };

  // Near you: for a signed-in customer with a saved address, the providers who serve that place. Nothing for visitors we know nothing about.
  let near: { place: string; rows: ProviderSummary[] } | null = null;
  if (me && !filtered && !noProviders) {
    const opts = await authOpts();
    const acct = (await fetchQuery(api.account.mine, {}, opts)) as { addresses: { suburb: string; isDefault: boolean }[] } | null;
    const addr = acct?.addresses.find((a) => a.isDefault) ?? acct?.addresses[0];
    if (addr) {
      const place = (await fetchQuery(api.locations.resolveSearchPlace, { name: addr.suburb })) as { status: string; place?: { _id: string; name: string } };
      if (place.status === "ok" && place.place) {
        const r = (await fetchQuery(api.providers.search, { placeId: place.place._id as never, offset: 0, limit: 8 })) as { rows: ProviderSummary[] };
        if (r.rows.length > 0) near = { place: place.place.name, rows: r.rows };
      }
    }
  }


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
          <div className="lp-hero__text">
            <h1 className="lp-hero__title">{me ? greeting : "Good help."}<br />{me ? "What needs doing?" : "Right around the corner."}</h1>
            <p className="lp-hero__sub">Find trusted local people for everyday jobs.</p>
          </div>
          <div className="lp-hero__tools">
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
          {popular.length > 0 && (
            <p className="lp-popular"><span>Popular:</span>
              {popular.map((c) => <Link key={c.slug} href={`/categories/${encodeURIComponent(c.slug)}`} className="lp-popular__chip">{c.label}</Link>)}
            </p>
          )}
          <ul className="lp-trust" aria-label="Why people use Localo">
            <li><Icon name="shield" size={16} />{!noProviders ? `${real} approved ${real === 1 ? "provider" : "providers"}` : "Providers are approved before they appear"}</li>
            <li><Icon name="calendar" size={16} />Pick from their real availability</li>
            <li><Icon name="check" size={16} />Pay your provider directly</li>
          </ul>
          </div>
        </div>
      </section>

      <FeaturedCategories preloaded={featuredCats} />

      {near && (
        <section className="lp-section" id="near" aria-labelledby="near-h">
          <div className="lp-section__head">
            <h2 id="near-h" className="lp-h2">Near {near.place}</h2>
            <Link href={`/search?${new URLSearchParams({ where: near.place })}`} className="lp-link">View all</Link>
          </div>
          <p className="lp-section__sub">Providers who serve your saved address.</p>
          <ProviderCarousel label={`Providers near ${near.place}`}>{near.rows.map(card)}</ProviderCarousel>
        </section>
      )}

      {noProviders ? (
        <section className="lp-launch" id="pros" aria-labelledby="launch-h">
          <span className="lp-launch__glow" aria-hidden="true" />
          <span className="lp-launch__badge"><span className="lp-launch__pulse" aria-hidden="true" />Now welcoming providers</span>
          <h2 id="launch-h" className="lp-launch__title">Providers are joining now</h2>
          <p className="lp-launch__sub">Localo is new. Local people are applying, and each one is approved before they appear here.</p>
          <ul className="lp-launch__float" aria-hidden="true">
            {(["cleaning", "gardening", "handyman", "petCare", "car", "moving"] as const).map((n, i) => (
              <li key={n} style={{ animationDelay: `${i * 0.45}s` }}><Icon name={n} size={22} /></li>
            ))}
          </ul>
          <div className="lp-launch__cards">
            <div className="lp-launch__card">
              <span className="lp-launch__icon"><Icon name="search" size={22} /></span>
              <h3>Looking for help?</h3>
              <p>Browse the categories to see what will be offered. Providers show up here as soon as they&apos;re approved, so check back soon.</p>
              <Link href="/categories" className="btn btn--secondary">Browse categories</Link>
            </div>
            <div className="lp-launch__card lp-launch__card--accent">
              <span className="lp-launch__icon"><Icon name="briefcase" size={22} /></span>
              <h3>Offer your services</h3>
              <p>Be one of the first on Localo. Apply, get approved, and start receiving booking requests from people nearby.</p>
              <Link href={me?.role === "provider" ? "/provider" : "/provider/register"} className="btn btn--forest">{me?.role === "provider" ? "Go to your dashboard" : "Become a provider"}</Link>
            </div>
          </div>
          {process.env.NODE_ENV !== "production" && <p className="lp-launch__dev">Development: run <code>pnpm convex:seed</code> for sample providers.</p>}
        </section>
      ) : (
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
            <ProviderCarousel label="Featured providers">
              {list.map(card)}
            </ProviderCarousel>
          )}
          {found.total > list.length && (
            <p className="lp-more"><Link href={`/search${filtered ? `?${new URLSearchParams(Object.entries({ q, category, where: suburb }).filter(([, v]) => v) as [string, string][])}` : ""}`} className="btn btn--secondary">See all {found.total}{found.capped ? "+" : ""} providers</Link></p>
          )}
        </section>
      )}

      <section className={noProviders ? "lp-section lp-tint" : "lp-section"} id="how-it-works" aria-labelledby="how-h">
        <div className="lp-section__head">
          <h2 id="how-h" className="lp-h2">How it works</h2>
          <Link href="/search" className="lp-link">Find a provider</Link>
        </div>
        <p className="lp-section__sub">Three steps, and nothing is booked until the provider says yes.</p>
        <ol className="lp-how">
          {([
            ["search", "Find", "Search by what you need and where you are, or browse the categories. Every provider listed has been approved."],
            ["calendar", "Request a time", "Choose a service and a time from the provider's real availability. Fixed prices are shown up front; quotes come from the provider."],
            ["user", "Get it done", "The provider accepts or declines. Once they accept, you meet them and pay them directly, then leave a review."],
          ] as const).map(([icon, title, text], i) => (
            <li key={title} className="lp-how__card">
              <span className="lp-how__num" aria-hidden="true">0{i + 1}</span>
              <span className="lp-how__icon"><Icon name={icon} size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {recentReviews.length > 0 && (
        <section className="lp-section" id="reviews" aria-labelledby="rev-h">
          <div className="lp-section__head">
            <h2 id="rev-h" className="lp-h2">What customers say</h2>
          </div>
          <p className="lp-section__sub">Recent reviews from completed jobs. Every one is written by a customer who booked.</p>
          <ProviderCarousel label="Recent reviews">
            {recentReviews.map((r) => (
              <article key={r._id} className="lp-rev">
                <span className="lp-rev__stars" role="img" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <p className="lp-rev__text">&ldquo;{r.text}&rdquo;</p>
                <footer className="lp-rev__by">
                  <strong>{r.customerName}</strong>
                  <Link href={`/providers/${r.providerId}/reviews`}>on {r.providerName} →</Link>
                </footer>
              </article>
            ))}
          </ProviderCarousel>
        </section>
      )}

      <section className="lp-section" aria-labelledby="why-h">
        <h2 id="why-h" className="lp-h2">Built to be straightforward</h2>
        <ul className="lp-why">
          {([
            ["shield", "Approved first", "People apply and an admin approves them before they appear in search."],
            ["calendar", "Real availability", "You choose from the times a provider has actually opened up."],
            ["check", "A request, not a promise", "Nothing is confirmed until the provider accepts, so you always know where you stand."],
            ["card", "Pay directly", "Localo doesn't take or hold payment. You settle up with your provider."],
          ] as const).map(([icon, title, text]) => (
            <li key={title}><span className="lp-why__icon"><Icon name={icon} size={20} /></span><div><strong>{title}</strong><span>{text}</span></div></li>
          ))}
        </ul>
      </section>

      <section className="lp-section" id="faq" aria-labelledby="faq-h">
        <h2 id="faq-h" className="lp-h2">Common questions</h2>
        <div className="lp-faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="lp-faq__item">
              <summary>{q}<span className="lp-faq__chev" aria-hidden="true" /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {!noProviders && (
      <section className="lp-biz" aria-labelledby="biz-h">
        <div className="lp-biz__body">
          <h2 id="biz-h" className="lp-biz__title">Run a local business?</h2>
          <p>Apply to join Localo, get approved, and receive booking requests from people nearby. You choose your services, your prices and when you&apos;re available.</p>
          <Link href={me?.role === "provider" ? "/provider" : "/provider/register"} className="btn btn--cream">{me?.role === "provider" ? "Go to your dashboard" : "Become a provider"}</Link>
        </div>
        <div className="lp-biz__photos" aria-hidden="true">
          <Image src="/images/business/gardening.jpg" alt="" width={320} height={320} sizes="(min-width: 960px) 200px, 30vw" />
          <Image src="/images/business/car-detailing.jpg" alt="" width={320} height={320} sizes="(min-width: 960px) 200px, 30vw" />
          <Image src="/images/business/moving-help.jpg" alt="" width={320} height={320} sizes="(min-width: 960px) 200px, 30vw" />
        </div>
      </section>
      )}

      <nav className="lp-foot" aria-label="Site">
        <div className="lp-foot__brand"><span className="brand__word">Localo</span><p>Find trusted local people for everyday jobs.</p></div>
        <div><h2>Customers</h2><ul><li><Link href="/search">Find services</Link></li><li><Link href="/categories">All categories</Link></li><li><Link href="/#how-it-works">How it works</Link></li></ul></div>
        <div><h2>Providers</h2><ul><li><Link href={me?.role === "provider" ? "/provider" : "/provider/register"}>{me?.role === "provider" ? "Your dashboard" : "Become a provider"}</Link></li></ul></div>
        <div><h2>Account</h2><ul>{me ? <li><Link href="/account">Account settings</Link></li> : <><li><Link href="/signin">Log in</Link></li><li><Link href="/signin">Sign up</Link></li></>}</ul></div>
      </nav>
    </div>
  );
}

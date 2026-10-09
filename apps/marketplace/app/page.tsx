import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api, CATEGORIES } from "../lib/convex";
import { getMe } from "../lib/auth";
import Icon from "../components/Icon";
import ProviderCard, { type ProviderSummary } from "../components/ProviderCard";
import { categoryMeta } from "../components/categories";
import { dollars, partOfDay } from "../components/format";

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

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const { category, suburb, q } = await searchParams;
  const filtered = !!(category || suburb || q);
  const [list, all, me] = await Promise.all([
    fetchQuery(api.providers.list, { category: category || undefined, suburb: suburb || undefined, q: q || undefined }) as Promise<ProviderSummary[]>,
    // Unfiltered list feeds the category tiles' "from $X" and pro counts.
    filtered ? (fetchQuery(api.providers.list, {}) as Promise<ProviderSummary[]>) : null,
    getMe(),
  ]);
  const everyone = all ?? list;

  const stats = CATEGORIES.map((c) => {
    const inCat = everyone.filter((p) => p.category === c);
    const cheapest = inCat.reduce<ProviderSummary | null>((m, p) => (!m || p.rateCents < m.rateCents ? p : m), null);
    return { c, count: inCat.length, cheapest };
  });

  const firstName = me?.name?.trim().split(/\s+/)[0];
  const greeting = `Good ${partOfDay()}${firstName ? `, ${firstName}` : ""}.`;
  const heading = filtered
    ? `${list.length} ${list.length === 1 ? "pro" : "pros"}${category ? ` for ${categoryMeta(category).label.toLowerCase()}` : ""}${suburb ? ` near ${suburb}` : ""}`
    : `${list.length} ${list.length === 1 ? "pro" : "pros"}`;

  return (
    <div className="page page--wide">
      <section className="hero">
        {me ? (
          <h1 className="display">{greeting}<span className="display__muted">What needs doing?</span></h1>
        ) : (
          <h1 className="display">Trusted local help, close to home.<span className="display__muted">Find a pro and request a time.</span></h1>
        )}

        <form className="search card" role="search" action="/">
          {category && <input type="hidden" name="category" value={category} />}
          <div className="search__field search__field--main">
            <label htmlFor="q" className="sr-only">Keyword</label>
            <Icon name="search" size={22} className="search__icon" />
            <input id="q" name="q" placeholder="What do you need done?" defaultValue={q} autoComplete="off" />
          </div>
          <div className="search__row">
            <div className="search__field">
              <label htmlFor="suburb" className="sr-only">Suburb</label>
              <Icon name="pin" size={20} className="search__icon" />
              <input id="suburb" name="suburb" placeholder="Suburb" defaultValue={suburb} autoComplete="address-level2" />
            </div>
            <button className="btn btn--primary">Search</button>
          </div>
        </form>

        <nav className="chips" aria-label="Categories">
          <Link href={href({ q, suburb })} className="chip" aria-current={!category ? "page" : undefined}>All</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={href({ q, suburb, category: c })} className="chip" aria-current={category === c ? "page" : undefined}>
              {categoryMeta(c).label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="section" aria-labelledby="services-h">
        <h2 id="services-h" className="section__title">Services</h2>
        <div className="tiles">
          {stats.map(({ c, count, cheapest }, i) => {
            const m = categoryMeta(c);
            const active = category === c;
            return (
              <Link
                key={c}
                href={href({ q, suburb, category: c })}
                className={`tile tile--${m.hue} rise`}
                style={{ "--i": i } as React.CSSProperties}
                aria-current={active ? "page" : undefined}
              >
                <span className="tile__chip"><Icon name={m.icon} size={24} /></span>
                <span className="tile__name">{m.label}</span>
                <span className="tile__meta">
                  {cheapest ? (
                    <><span className="num">from {dollars(cheapest.rateCents)}{cheapest.rateBasis === "hourly" ? "/hr" : " fixed"}</span> · <span className="num">{count} {count === 1 ? "pro" : "pros"}</span></>
                  ) : "No pros yet"}
                </span>
                {active && <span className="tile__check"><Icon name="check" size={16} /></span>}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="pros-h">
        <div className="section__head">
          <h2 id="pros-h" className="section__title num">{heading}</h2>
          {filtered && <Link href="/" className="link-btn">Clear filters</Link>}
        </div>
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
          <div className="plist">
            {list.map((p, i) => <ProviderCard key={p._id} p={p} index={i + 6} />)}
          </div>
        )}
      </section>
    </div>
  );
}

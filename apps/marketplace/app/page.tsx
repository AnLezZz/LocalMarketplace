import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api, CATEGORIES } from "../lib/convex";
import { meta, price } from "../lib/ui";
import { Hero, Reveal, Stagger, Item } from "../components/motion";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string; suburb?: string; q?: string }> }) {
  const { category, suburb, q } = await searchParams;
  const list = await fetchQuery(api.providers.list, { category: category || undefined, suburb: suburb || undefined, q: q || undefined });

  return (
    <>
      <section className="hero">
        <div className="orb a" /><div className="orb b" /><div className="orb c" />
        <div className="wrap">
          <Hero>
            <span className="pill"><span className="dot" /> Now live in Auckland</span>
            <h1>Trusted local help, <span className="grad">close to home.</span></h1>
            <p className="sub">Compare cleaners, gardeners, handymen and more. Request a time in under three minutes. Pay your provider directly.</p>
            <form className="search" action="/#browse">
              <label><span>Service</span>
                <select name="category" defaultValue={category ?? ""}>
                  <option value="">Any service</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
              <label><span>Suburb</span><input name="suburb" placeholder="e.g. Ponsonby" defaultValue={suburb} /></label>
              <label><span>Keyword</span><input name="q" placeholder="e.g. eco, lawns" defaultValue={q} /></label>
              <button className="btn">Search</button>
            </form>
            <div className="chips">
              {CATEGORIES.map((c) => (
                <Link key={c} href={`/?category=${encodeURIComponent(c)}#browse`} className={`chip${category === c ? " on" : ""}`}>{meta(c).emoji} {c}</Link>
              ))}
            </div>
            <div className="stats">
              <div><b>6</b>service categories</div><div><b>★ 4.8</b>average rating</div><div><b>$0</b>platform fees</div>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section" id="browse">
        <div className="wrap">
          <Reveal><div className="eyebrow">Browse</div><h2>{category ? `${category[0].toUpperCase()}${category.slice(1)} near you` : "Providers near you"}</h2></Reveal>
          {list.length === 0 ? (
            <div className="empty">No providers found. Try a different filter, or run <code>pnpm convex:seed</code> on a fresh database.</div>
          ) : (
            <Stagger className="grid">
              {list.map((p: any) => {
                const m = meta(p.category);
                return (
                  <Item key={p._id}>
                    <Link href={`/providers/${p._id}`} className="card">
                      <div className="glow" style={{ background: `hsl(${m.hue} 60% 70%)` }} />
                      <div className="avatar" style={{ background: `hsl(${m.hue} 55% 90%)` }}>{m.emoji}</div>
                      <h3>{p.name}</h3>
                      <div className="meta"><span className="tag">{p.category}</span><span>{p.suburb}</span><span>★ {p.ratingAvg} ({p.reviewCount})</span></div>
                      <div className="foot"><div className="price"><small>from</small>{price(p)}</div><div className="arrow">→</div></div>
                    </Link>
                  </Item>
                );
              })}
            </Stagger>
          )}
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <Reveal><div className="eyebrow">How it works</div><h2>Booked in three steps.</h2></Reveal>
          <Stagger className="steps">
            {[["1", "Find", "Search by suburb and service, and compare ratings and rates."], ["2", "Request", "Pick a time and describe the job. The provider accepts or declines."], ["3", "Pay direct", "Settle with your provider once the job is done. No platform fees."]].map(([n, t, d]) => (
              <Item key={n}><div className="step"><div className="n">{n}</div><h3>{t}</h3><p>{d}</p></div></Item>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <Reveal>
            <div className="band">
              <h2>Run a local service?</h2>
              <p>Get found by neighbours, manage requests in one inbox, keep 100% of what you earn.</p>
              <Link href="/provider" className="btn">Open provider inbox →</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

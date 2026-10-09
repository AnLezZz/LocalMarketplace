import Link from "next/link";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb, providers, CATEGORIES } from "@localhub/db";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string; suburb?: string; q?: string }> }) {
  const { category, suburb, q } = await searchParams;
  const conds = [eq(providers.approved, true)];
  if (category) conds.push(eq(providers.category, category));
  if (suburb) conds.push(ilike(providers.suburb, `%${suburb}%`));
  if (q) conds.push(or(ilike(providers.name, `%${q}%`), ilike(providers.bio, `%${q}%`))!);
  const list = await getDb().select().from(providers).where(and(...conds));

  return (
    <>
      <h1>Trusted local help, close to home.</h1>
      <form className="filters">
        <select name="category" defaultValue={category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="suburb" placeholder="Suburb" defaultValue={suburb} aria-label="Suburb" />
        <input name="q" placeholder="Keyword" defaultValue={q} aria-label="Keyword" />
        <button>Search</button>
      </form>
      {list.length === 0 && <p className="muted">No providers match yet.</p>}
      <div className="grid">
        {list.map((p) => (
          <Link key={p.id} href={`/providers/${p.id}`} className="card">
            <h3>{p.name}</h3>
            <div className="muted">{p.category} · {p.suburb}</div>
            <p>From ${(p.rateCents / 100).toFixed(0)}{p.rateBasis === "hourly" ? "/hr" : ""}</p>
            <div className="muted">★ {p.ratingAvg} ({p.reviewCount} reviews)</div>
          </Link>
        ))}
      </div>
    </>
  );
}

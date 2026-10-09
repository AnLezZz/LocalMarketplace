import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api, CATEGORIES } from "../lib/convex";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string; suburb?: string; q?: string }> }) {
  const { category, suburb, q } = await searchParams;
  const list = await fetchQuery(api.providers.list, { category: category || undefined, suburb: suburb || undefined, q: q || undefined });

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
        {list.map((p: any) => (
          <Link key={p._id} href={`/providers/${p._id}`} className="card">
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

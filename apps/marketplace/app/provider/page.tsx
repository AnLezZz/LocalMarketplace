import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../lib/convex";
import { meta } from "../../lib/ui";
import { Stagger, Item } from "../../components/motion";

export const dynamic = "force-dynamic";

// TEMPORARY: unauthenticated provider picker. Replace with login before real users.
export default async function Providers() {
  const list = await fetchQuery(api.providers.list, {});
  return (
    <div className="wrap">
      <div className="page-h"><div className="eyebrow">Provider inbox</div><h1>Choose your business.</h1></div>
      {list.length === 0 && <div className="empty">No providers in the database. Run <code>pnpm convex:seed</code>.</div>}
      <Stagger className="grid">
        {list.map((p: any) => (
          <Item key={p._id}>
            <Link href={`/provider/${p._id}`} className="card">
              <div className="avatar" style={{ background: `hsl(${meta(p.category).hue} 55% 90%)` }}>{meta(p.category).emoji}</div>
              <h3>{p.name}</h3>
              <div className="meta"><span className="tag">{p.category}</span><span>{p.suburb}</span></div>
              <div className="foot"><span className="meta">Open inbox</span><div className="arrow">→</div></div>
            </Link>
          </Item>
        ))}
      </Stagger>
    </div>
  );
}

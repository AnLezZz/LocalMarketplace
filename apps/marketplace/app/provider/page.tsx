import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../lib/convex";

export const dynamic = "force-dynamic";

// TEMPORARY: unauthenticated provider picker. Replace with login before real users.
export default async function Providers() {
  const list = await fetchQuery(api.providers.list, {});
  return (
    <>
      <h1>Provider inbox</h1>
      <p className="muted">Pick a provider to see their requests.</p>
      {list.length === 0 && <p className="msg">No providers in the database. Run <code>pnpm convex:seed</code>.</p>}
      {list.map((p: any) => (
        <div className="row" key={p._id}><span>{p.name} · {p.suburb}</span><Link href={`/provider/${p._id}`}>Open inbox</Link></div>
      ))}
    </>
  );
}

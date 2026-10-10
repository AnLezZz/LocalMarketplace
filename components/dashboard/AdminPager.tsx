import Link from "next/link";
import type { AdminPage } from "../../lib/adminPage";

/** Under an admin table: "Older" to the next page, "Back to the start", and a note when a search could not look at everything. */
export default function AdminPager({ base, params = {}, cursor, result, cursorParam = "cursor" }: {
  base: string; params?: Record<string, string | undefined>; cursor?: string; result: Pick<AdminPage<unknown>, "isDone" | "continueCursor" | "searched" | "truncated">; cursorParam?: string;
}) {
  const href = (next?: string) => {
    const q = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    if (next) q.set(cursorParam, next);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  if (result.searched) {
    return result.truncated ? <p className="field__hint adm-pager__note">Showing up to 100 matches from the 1,000 newest. Narrow the search to find older ones.</p> : null;
  }
  if (!cursor && result.isDone) return null;
  return (
    <nav className="adm-pager" aria-label="Pages">
      {cursor ? <Link href={href()} className="btn btn--secondary btn--sm">← Back to the start</Link> : <span />}
      {!result.isDone && <Link href={href(result.continueCursor)} className="btn btn--secondary btn--sm" rel="next">Older →</Link>}
    </nav>
  );
}

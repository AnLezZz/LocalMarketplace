import type { PaginationOptions } from "convex/server";

/** One page of an admin table. `searched`: the rows came from a text search over the newest rows, not from paging. */
export type AdminPage<T> = { page: T[]; isDone: boolean; continueCursor: string; searched: boolean; truncated: boolean };

/** A text search reads this many of the newest rows and keeps at most SEARCH_MAX matches. Text can't be indexed across joined records. */
export const SEARCH_SCAN = 1000;
export const SEARCH_MAX = 100;

type Pageable<D> = {
  paginate(opts: PaginationOptions): Promise<{ page: D[]; isDone: boolean; continueCursor: string }>;
  take(n: number): Promise<D[]>;
};

/**
 * Pages an admin table. Without a search it is a real cursor page (any amount of data). With a search it reads the newest
 * SEARCH_SCAN rows once, keeps the matches (up to SEARCH_MAX) and says so, so the screen can tell the admin to narrow it.
 * `keep` turns a row into what the table shows, or null to drop it.
 */
export async function adminPage<D, T>(query: Pageable<D>, opts: PaginationOptions, searching: boolean, keep: (d: D) => Promise<T | null> | T | null): Promise<AdminPage<T>> {
  if (searching) {
    const docs = await query.take(SEARCH_SCAN);
    const out: T[] = [];
    for (const d of docs) {
      const row = await keep(d);
      if (row !== null) out.push(row);
      if (out.length >= SEARCH_MAX) break;
    }
    return { page: out, isDone: true, continueCursor: "", searched: true, truncated: docs.length === SEARCH_SCAN || out.length >= SEARCH_MAX };
  }
  const r = await query.paginate(opts);
  const out: T[] = [];
  for (const d of r.page) { const row = await keep(d); if (row !== null) out.push(row); }
  return { page: out, isDone: r.isDone, continueCursor: r.continueCursor, searched: false, truncated: false };
}

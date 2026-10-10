import { redirect } from "next/navigation";

export type AdminPage<T> = { page: T[]; isDone: boolean; continueCursor: string; searched: boolean; truncated: boolean };
export const ADMIN_PAGE_SIZE = 25;

/** Loads one page of an admin table. A cursor that no longer fits (the filter changed, or it is old) falls back to the first page instead of an error. */
export async function loadAdminPage<T>(startUrl: string, cursor: string | undefined, load: (cursor: string | null) => Promise<AdminPage<T>>): Promise<AdminPage<T>> {
  try {
    return await load(cursor || null);
  } catch (e) {
    if (cursor) redirect(startUrl);
    throw e;
  }
}

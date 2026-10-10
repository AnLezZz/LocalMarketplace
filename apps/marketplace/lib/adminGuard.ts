import { notFound } from "next/navigation";
import { getMe } from "./auth";

/** Call first in every admin page, before any data is fetched, so non-admins get a 404 rather than an error. */
export async function requireAdminPage() {
  const me = await getMe();
  if (me?.role !== "admin") notFound();
  return me;
}

export const PROVIDER_PILL: Record<string, string> = { approved: "completed", pending: "requested", rejected: "neutral", suspended: "danger" };
export const when = (ms: number) =>
  new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);

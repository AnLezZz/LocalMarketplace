import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "./convex";
import { authOpts } from "./auth";

/** What every provider dashboard page needs: who they are and their bookings. Sends someone without a profile to register. */
export async function loadProviderDash() {
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await fetchQuery(api.bookings.listIncoming, {}, opts)) as any[];
  const now = Date.now();
  const pending = rows.filter((b) => b.status === "requested");
  const upcoming = rows.filter((b) => b.status === "accepted" && b.endsAt >= now).sort((a, b) => a.startsAt - b.startsAt);
  return { opts, profile, rows, now, pending, upcoming };
}

import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "./convex";
import { authOpts } from "./auth";

export type Summary = { pending: number; upcoming: number; completed: number; history: number; all: number; cap: number; capped: boolean };

/** What every provider dashboard page needs: who they are and the accurate counts. Sends someone without a profile to register. */
export async function loadProviderShell() {
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");
  const summary = ((await fetchQuery(api.bookings.providerSummary, {}, opts)) as Summary | null) ?? { pending: 0, upcoming: 0, completed: 0, history: 0, all: 0, cap: 1000, capped: false };
  return { opts, profile, summary };
}

/** A count that stopped at the cap reads "1,000+", not a number that looks exact. */
export const countLabel = (n: number, cap: number) => (n >= cap ? `${cap.toLocaleString("en-NZ")}+` : String(n));

export type PageResult<T> = { page: T[]; isDone: boolean; continueCursor: string };

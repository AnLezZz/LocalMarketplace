import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEFAULT_CITY = "Auckland";
export const MAX_SUBURBS = 500;

/** Matching key: case, spacing and "Mt"/"Mount" do not matter. */
export function suburbKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().replace(/^mt /, "mount ");
}

/** May the marketplace take work in this suburb? With no suburbs configured there is no restriction. */
export async function suburbAllowed(ctx: QueryCtx | MutationCtx, suburb: string): Promise<boolean> {
  if ((await ctx.db.query("suburbs").first()) === null) return true;
  const row = await ctx.db.query("suburbs").withIndex("by_key", (q) => q.eq("key", suburbKey(suburb))).unique();
  return !!row?.enabled;
}

export async function requireSupportedSuburb(ctx: QueryCtx | MutationCtx, suburb: string, message?: (s: string) => string) {
  if (!(await suburbAllowed(ctx, suburb))) throw new ConvexError(message ? message(suburb) : `We don't cover ${suburb} yet`);
}

export async function launchCity(ctx: QueryCtx | MutationCtx): Promise<string> {
  return (await ctx.db.query("marketplaceSettings").first())?.launchCity ?? DEFAULT_CITY;
}

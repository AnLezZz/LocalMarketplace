import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { suburbKey } from "./locations";
import { servesSuburb } from "./jobDetails";

type Ctx = QueryCtx | MutationCtx;
export const MAX_AREAS = 50;

/** Once geography has been imported, `places` + `closedAreas` decide coverage; before that the legacy suburb list does. */
export async function hasPlaces(ctx: Ctx): Promise<boolean> {
  return (await ctx.db.query("places").first()) !== null;
}

/** Recognised, selectable places with this name (case, macron and Mt/Mount insensitive). Several is normal: there are many Newtowns. */
export async function findPlaces(ctx: Ctx, name: string): Promise<Doc<"places">[]> {
  const rows = await ctx.db.query("places").withIndex("by_key", (q) => q.eq("key", suburbKey(name))).take(40);
  return rows.filter((p) => p.selectable && p.active);
}

export async function isClosed(ctx: Ctx, place: Doc<"places">): Promise<boolean> {
  for (const id of [place._id, ...place.regionIds, ...place.taIds, ...(place.subdivisionIds ?? [])]) {
    if (await ctx.db.query("closedAreas").withIndex("by_place", (q) => q.eq("placeId", id)).first()) return true;
  }
  return false;
}

export type Coverage = { status: "unrecognised" } | { status: "not_launched" } | { status: "covered"; places: Doc<"places">[] };

/** The three outcomes the UI must tell apart. "Covered" lists only the open matches. */
export async function coverageOf(ctx: Ctx, name: string): Promise<Coverage> {
  const found = await findPlaces(ctx, name);
  if (found.length === 0) return { status: "unrecognised" };
  const open: Doc<"places">[] = [];
  for (const p of found) if (!(await isClosed(ctx, p))) open.push(p);
  return open.length ? { status: "covered", places: open } : { status: "not_launched" };
}

/** Name plus enough context to tell two Newtowns apart: council(s), then region. */
export async function describePlace(ctx: Ctx, p: Doc<"places">) {
  const names = async (ids: Id<"places">[]) => (await Promise.all(ids.map((id) => ctx.db.get(id)))).flatMap((x) => (x ? [x.name] : []));
  const context = p.kind === "region" ? "Region" : p.kind === "territorial_authority" ? "Council area" : [...(await names(p.taIds)), ...(await names(p.regionIds))].filter((n, i, a) => a.indexOf(n) === i).join(", ");
  return { _id: p._id, name: p.name, kind: p.kind, context };
}

/** Does the provider take a job in this suburb? Their own base counts as that suburb only, never the region around it. */
export async function providerServes(ctx: Ctx, provider: Doc<"providers">, suburb: string): Promise<boolean> {
  // Until the migration has reviewed a provider's text, their existing rules keep applying unchanged.
  if (!(await hasPlaces(ctx)) || provider.locationMigratedAt === undefined) return servesSuburb(provider, suburb);
  const areas = new Set<Id<"places">>([...(provider.baseAreaId ? [provider.baseAreaId] : []), ...(provider.serviceAreaIds ?? [])]);
  for (const c of await findPlaces(ctx, suburb)) {
    if (areas.has(c._id) || [...c.regionIds, ...c.taIds, ...(c.subdivisionIds ?? [])].some((a) => areas.has(a))) return true;
  }
  // Base suburb not linked to a place yet (waiting in the review queue): fall back to its text, nothing wider.
  return !provider.baseAreaId && suburbKey(provider.suburb) === suburbKey(suburb);
}

/** Links a provider's base suburb text to one place, or queues it for review. Never guesses between candidates. */
export async function linkBase(ctx: MutationCtx, provider: Doc<"providers">, text: string) {
  const found = (await findPlaces(ctx, text)).filter((p) => p.kind === "suburb" || p.kind === "locality");
  if (found.length === 1) { await ctx.db.patch(provider._id, { baseAreaId: found[0]._id }); await syncProviderAreas(ctx, provider._id); return "linked" as const; }
  await ctx.db.patch(provider._id, { baseAreaId: undefined });
  await syncProviderAreas(ctx, provider._id);
  await queueReview(ctx, provider._id, "base", text, found.length ? "ambiguous" : "unmatched", found.map((p) => p._id));
  return found.length ? ("ambiguous" as const) : ("unmatched" as const);
}

export async function queueReview(ctx: MutationCtx, providerId: Id<"providers">, field: "base" | "service", raw: string, reason: "unmatched" | "ambiguous", candidateIds: Id<"places">[]) {
  const open = await ctx.db.query("locationReviews").withIndex("by_provider", (q) => q.eq("providerId", providerId)).take(100);
  if (open.some((r) => r.status === "open" && r.field === field && suburbKey(r.raw) === suburbKey(raw))) return;
  await ctx.db.insert("locationReviews", { providerId, field, raw, reason, candidateIds: candidateIds.slice(0, 10), status: "open" });
}

/** Rebuilds the search rows for one provider from their base and chosen areas. Call after any change to either. */
export async function syncProviderAreas(ctx: MutationCtx, providerId: Id<"providers">) {
  const old = await ctx.db.query("providerAreas").withIndex("by_provider", (q) => q.eq("providerId", providerId)).take(500);
  for (const r of old) await ctx.db.delete(r._id);
  const provider = await ctx.db.get(providerId);
  if (!provider) return;
  const serves = new Set<Id<"places">>([...(provider.baseAreaId ? [provider.baseAreaId] : []), ...(provider.serviceAreaIds ?? [])]);
  const within = new Set<Id<"places">>();
  for (const id of serves) {
    const p = await ctx.db.get(id);
    for (const a of p ? [...p.regionIds, ...p.taIds, ...(p.subdivisionIds ?? [])] : []) within.add(a);
  }
  for (const placeId of serves) await ctx.db.insert("providerAreas", { providerId, placeId, mode: "serves" });
  for (const placeId of within) await ctx.db.insert("providerAreas", { providerId, placeId, mode: "within" });
}

export type Resolved =
  | { status: "unrecognised" }
  | { status: "not_launched"; name: string }
  | { status: "ambiguous"; options: Awaited<ReturnType<typeof describePlace>>[] }
  | { status: "ok"; place: Awaited<ReturnType<typeof describePlace>> };

/** One typed name, or an already-chosen place, to exactly one place or a clear reason why not. Wider areas win a tie between kinds; two of the same kind (two Newtowns) ask. */
export async function resolveSearch(ctx: Ctx, input: { name?: string; placeId?: Id<"places"> }): Promise<Resolved> {
  if (input.placeId) {
    const p = await ctx.db.get(input.placeId);
    if (p && p.selectable && p.active) return (await isClosed(ctx, p)) ? { status: "not_launched", name: p.name } : { status: "ok", place: await describePlace(ctx, p) };
  }
  const name = (input.name ?? "").trim();
  if (!name) return { status: "unrecognised" };
  const found = await findPlaces(ctx, name);
  if (found.length === 0) return { status: "unrecognised" };
  const open: Doc<"places">[] = [];
  for (const p of found) if (!(await isClosed(ctx, p))) open.push(p);
  if (open.length === 0) return { status: "not_launched", name: found[0].name };
  const of = (...k: string[]) => open.filter((p) => k.includes(p.kind));
  const [regions, tas, subs] = [of("region"), of("territorial_authority"), of("suburb", "locality")];
  const pick = regions.length === 1 ? regions[0] : regions.length === 0 && tas.length === 1 ? tas[0] : regions.length + tas.length === 0 && subs.length === 1 ? subs[0] : undefined;
  if (pick) return { status: "ok", place: await describePlace(ctx, pick) };
  return { status: "ambiguous", options: await Promise.all(open.slice(0, 10).map((p) => describePlace(ctx, p))) };
}

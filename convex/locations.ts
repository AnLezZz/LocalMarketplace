import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./model/auth";
import { audit } from "./model/audit";
import { launchCity, MAX_SUBURBS, suburbKey } from "./model/locations";
import { coverageOf, describePlace, hasPlaces, isClosed, resolveSearch, syncProviderAreas } from "./model/coverage";
import { getUser } from "./model/auth";

/** The launch city and the suburbs customers can use. Public: it feeds suggestions and the city name in the UI. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    // Nationwide once geography is imported; autocomplete (searchPlaces) replaces the suggestion list.
    if (await hasPlaces(ctx)) return { city: "New Zealand", restricted: false, places: true, suburbs: [] as string[] };
    const rows = await ctx.db.query("suburbs").take(MAX_SUBURBS + 1);
    return {
      city: await launchCity(ctx),
      restricted: rows.length > 0,
      places: false,
      suburbs: rows.filter((r) => r.enabled).map((r) => r.name).sort((a, b) => a.localeCompare(b)),
    };
  },
});

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db.query("suburbs").take(MAX_SUBURBS + 1);
    return { city: await launchCity(ctx), suburbs: rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ _id: r._id, name: r.name, enabled: r.enabled })) };
  },
});

export const setCity = mutation({
  args: { city: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const city = a.city.trim().replace(/\s+/g, " ");
    if (!city) throw new ConvexError("Enter the city name");
    if (city.length > 60) throw new ConvexError("That name is too long");
    const existing = await ctx.db.query("marketplaceSettings").first();
    if (existing) await ctx.db.patch(existing._id, { launchCity: city }); else await ctx.db.insert("marketplaceSettings", { launchCity: city });
    await audit(ctx, admin._id, "location.city", "setting", "launchCity", city);
  },
});

/** Adds suburbs (one per line or comma separated). Names already listed, in any spelling, are skipped. */
export const addSuburbs = mutation({
  args: { names: v.array(v.string()) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const existing = await ctx.db.query("suburbs").take(MAX_SUBURBS + 1);
    const seen = new Set(existing.map((r) => r.key));
    let added = 0;
    for (const raw of a.names) {
      const name = raw.trim().replace(/\s+/g, " ");
      if (!name) continue;
      if (name.length > 60) throw new ConvexError(`"${name.slice(0, 20)}..." is too long`);
      const key = suburbKey(name);
      if (!key || seen.has(key)) continue;
      if (seen.size >= MAX_SUBURBS) throw new ConvexError(`The list is limited to ${MAX_SUBURBS} suburbs`);
      seen.add(key);
      await ctx.db.insert("suburbs", { name, key, enabled: true });
      added++;
    }
    if (added > 0) await audit(ctx, admin._id, "suburb.add", "suburb", "bulk", `${added} added`);
    return added;
  },
});

export const setSuburbEnabled = mutation({
  args: { id: v.id("suburbs"), enabled: v.boolean() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const s = await ctx.db.get(a.id);
    if (!s) throw new ConvexError("Suburb not found");
    await ctx.db.patch(s._id, { enabled: a.enabled });
    await audit(ctx, admin._id, a.enabled ? "suburb.enable" : "suburb.disable", "suburb", s._id, s.name);
  },
});

/** Removing the last suburb switches the restriction off entirely, so it is a deliberate act. */
export const removeSuburb = mutation({
  args: { id: v.id("suburbs") },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const s = await ctx.db.get(a.id);
    if (!s) throw new ConvexError("Suburb not found");
    await ctx.db.delete(s._id);
    await audit(ctx, admin._id, "suburb.remove", "suburb", s._id, s.name);
  },
});

// ---------- recognised places and coverage ----------

/** Type-ahead over recognised places: prefix match on the normalised name, with context to tell duplicates apart. Public reference data. */
export const searchPlaces = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { q, limit }) => {
    const key = suburbKey(q.slice(0, 60));
    if (key.length < 2) return [];
    const rows = await ctx.db.query("places").withIndex("by_key", (i) => i.gte("key", key).lt("key", key + "\uffff")).take(200);
    const found = rows.filter((p) => p.selectable && p.active).slice(0, Math.min(limit ?? 15, 25));
    return await Promise.all(found.map(async (p) => ({ ...(await describePlace(ctx, p)), open: !(await isClosed(ctx, p)) })));
  },
});

/** Tells the three cases apart for one typed name, so the UI never infers "unsupported" from zero providers. */
export const coverage = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const c = await coverageOf(ctx, name.slice(0, 60));
    return c.status === "covered" ? { status: c.status, placeIds: c.places.map((p) => p._id) } : { status: c.status };
  },
});

/** The signed-in provider's base and chosen service areas, with context. */
export const myAreas = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const provider = await ctx.db.query("providers").withIndex("by_userId", (q) => q.eq("userId", user._id)).first();
    if (!provider) return null;
    const load = async (id?: Id<"places">) => { const p = id && (await ctx.db.get(id)); return p ? { ...(await describePlace(ctx, p)), open: !(await isClosed(ctx, p)) } : null; };
    return { enabled: await hasPlaces(ctx), base: await load(provider.baseAreaId), areas: (await Promise.all((provider.serviceAreaIds ?? []).map(load))).flatMap((x) => (x ? [x] : [])) };
  },
});

export const adminCoverage = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const regions = await ctx.db.query("places").withIndex("by_layer", (q) => q.eq("layer", "regional_council")).take(40);
    const closed = await ctx.db.query("closedAreas").take(300);
    const closedIds = new Set(closed.map((c) => c.placeId));
    const closedRows = (await Promise.all(closed.map(async (c) => { const p = await ctx.db.get(c.placeId); return p ? { ...(await describePlace(ctx, p)) } : null; }))).flatMap((x) => (x ? [x] : []));
    return {
      imported: regions.length > 0,
      regions: regions.filter((r) => r.selectable && r.active).sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ _id: r._id, name: r.name, open: !closedIds.has(r._id) })),
      closed: closedRows.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/** Open or close any recognised place. Closing a region or council area closes everything inside it. */
export const setAreaOpen = mutation({
  args: { placeId: v.id("places"), open: v.boolean() },
  handler: async (ctx, { placeId, open }) => {
    const admin = await requireRole(ctx, "admin");
    const place = await ctx.db.get(placeId);
    if (!place || !place.selectable) throw new ConvexError("Place not found");
    const row = await ctx.db.query("closedAreas").withIndex("by_place", (q) => q.eq("placeId", placeId)).first();
    if (open && row) await ctx.db.delete(row._id);
    if (!open && !row) await ctx.db.insert("closedAreas", { placeId, closedBy: admin._id, closedAt: Date.now() });
    await audit(ctx, admin._id, open ? "area.open" : "area.close", "place", placeId, place.name);
  },
});

export const reviews = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const open = await ctx.db.query("locationReviews").withIndex("by_status", (q) => q.eq("status", "open")).take(100);
    return await Promise.all(open.map(async (r) => {
      const provider = await ctx.db.get(r.providerId);
      const candidates = await Promise.all(r.candidateIds.map(async (id) => { const p = await ctx.db.get(id); return p ? await describePlace(ctx, p) : null; }));
      return { _id: r._id, provider: provider?.name ?? "Unknown", field: r.field, raw: r.raw, reason: r.reason, candidates: candidates.flatMap((c) => (c ? [c] : [])) };
    }));
  },
});

/** Link the provider's text to one of the offered candidates. */
export const resolveReview = mutation({
  args: { reviewId: v.id("locationReviews"), placeId: v.id("places") },
  handler: async (ctx, { reviewId, placeId }) => {
    const admin = await requireRole(ctx, "admin");
    const r = await ctx.db.get(reviewId);
    if (!r || r.status !== "open") throw new ConvexError("This review is already closed");
    if (!r.candidateIds.includes(placeId)) throw new ConvexError("Pick one of the suggested places");
    const provider = await ctx.db.get(r.providerId);
    if (provider) {
      if (r.field === "base") await ctx.db.patch(provider._id, { baseAreaId: placeId });
      else await ctx.db.patch(provider._id, { serviceAreaIds: [...new Set([...(provider.serviceAreaIds ?? []), placeId])] });
      await syncProviderAreas(ctx, provider._id);
    }
    await ctx.db.patch(r._id, { status: "resolved", resolvedPlaceId: placeId });
    await audit(ctx, admin._id, "location.review.resolve", "provider", r.providerId, r.raw);
  },
});

/** Leave the text unlinked (for example, it is not a real place). The provider keeps their profile. */
export const dismissReview = mutation({
  args: { reviewId: v.id("locationReviews") },
  handler: async (ctx, { reviewId }) => {
    const admin = await requireRole(ctx, "admin");
    const r = await ctx.db.get(reviewId);
    if (!r || r.status !== "open") throw new ConvexError("This review is already closed");
    await ctx.db.patch(r._id, { status: "dismissed" });
    await audit(ctx, admin._id, "location.review.dismiss", "provider", r.providerId, r.raw);
  },
});

/** What the search page needs to pick between its four outcomes. Accepts a chosen place (from autocomplete) or typed text. */
export const resolveSearchPlace = query({
  args: { name: v.optional(v.string()), placeId: v.optional(v.id("places")) },
  handler: async (ctx, { name, placeId }) => resolveSearch(ctx, { name: name?.slice(0, 60), placeId }),
});

/** The regions, for the suggestions shown before anything is typed. Public reference data. */
export const regions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("places").withIndex("by_layer", (q) => q.eq("layer", "regional_council")).take(40);
    const found = rows.filter((r) => r.selectable && r.active).sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(found.map(async (p) => ({ ...(await describePlace(ctx, p)), open: !(await isClosed(ctx, p)) })));
  },
});

/** One level down for browsing: a region's council areas, or a council area's suburbs and localities. */
export const children = query({
  args: { parentId: v.id("places") },
  handler: async (ctx, { parentId }) => {
    const edges = await ctx.db.query("placeParents").withIndex("by_parent", (q) => q.eq("parentId", parentId)).take(400);
    const rows = (await Promise.all(edges.map((e) => ctx.db.get(e.childId)))).flatMap((p) => (p && p.selectable && p.active ? [p] : []));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(rows.map(async (p) => ({ ...(await describePlace(ctx, p)), open: !(await isClosed(ctx, p)) })));
  },
});

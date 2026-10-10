import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./model/auth";
import { audit } from "./model/audit";
import { launchCity, MAX_SUBURBS, suburbKey } from "./model/locations";

/** The launch city and the suburbs customers can use. Public: it feeds suggestions and the city name in the UI. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("suburbs").take(MAX_SUBURBS + 1);
    return {
      city: await launchCity(ctx),
      restricted: rows.length > 0,
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

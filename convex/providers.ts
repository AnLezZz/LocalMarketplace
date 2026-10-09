import { queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export const list = query({
  args: { category: v.optional(v.string()), suburb: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { category, suburb, q }) => {
    const all = await ctx.db.query("providers").withIndex("by_approved", (i) => i.eq("approved", true)).collect();
    const s = suburb?.toLowerCase(), k = q?.toLowerCase();
    return all.filter((p) =>
      (!category || p.category === category) &&
      (!s || p.suburb.toLowerCase().includes(s)) &&
      (!k || p.name.toLowerCase().includes(k) || p.bio.toLowerCase().includes(k)));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const pid = ctx.db.normalizeId("providers", id);
    const p = pid && (await ctx.db.get(pid));
    return p && p.approved ? p : null;
  },
});

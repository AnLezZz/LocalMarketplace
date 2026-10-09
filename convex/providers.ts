import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { getProviderForUser, providerStatus, validateProfile } from "./model/providers";

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

/** The signed-in user's own provider profile, with its review status. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const p = await getProviderForUser(ctx, user._id);
    return p ? { ...p, status: providerStatus(p) } : null;
  },
});

/** Apply to become a provider, or fix a pending/rejected application. Approved profiles are locked. */
export const submitProfile = mutation({
  args: {
    name: v.string(), bio: v.string(), category: v.string(), suburb: v.string(),
    rateCents: v.number(), rateBasis: v.union(v.literal("hourly"), v.literal("fixed")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") throw new ConvexError("Admins cannot be providers");
    const fields = validateProfile(args);
    const existing = await getProviderForUser(ctx, user._id);
    if (existing?.approved) throw new ConvexError("Approved profiles can't be edited yet. Contact support.");
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, reviewedAt: undefined, rejectionReason: undefined });
      return existing._id;
    }
    const id = await ctx.db.insert("providers", {
      ...fields, userId: user._id, ratingAvg: 0, reviewCount: 0, approved: false,
    });
    await ctx.db.patch(user._id, { role: "provider" });
    return id;
  },
});

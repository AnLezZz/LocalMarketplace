import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { withPhotoUrl } from "./model/photos";

/** Provider ids the signed-in user has saved (for heart state). */
export const mineIds = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("favourites").withIndex("by_user", (q) => q.eq("userId", user._id)).take(200);
    return rows.map((r) => r.providerId);
  },
});

/** Saved providers that are still approved, newest saved first. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("favourites").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(200);
    const providers = await Promise.all(rows.map((r) => ctx.db.get(r.providerId)));
    return await Promise.all(providers.filter((p): p is NonNullable<typeof p> => !!p?.approved).map((p) => withPhotoUrl(ctx, p)));
  },
});

/** Saves the provider, or removes the save if it already exists. Returns the new state. */
export const toggle = mutation({
  args: { providerId: v.id("providers") },
  handler: async (ctx, { providerId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.query("favourites").withIndex("by_user_and_provider", (q) => q.eq("userId", user._id).eq("providerId", providerId)).unique();
    if (existing) { await ctx.db.delete(existing._id); return false; }
    const provider = await ctx.db.get(providerId);
    if (!provider?.approved) throw new ConvexError("provider not found");
    if (provider.userId === user._id) throw new ConvexError("You can't save your own listing");
    await ctx.db.insert("favourites", { userId: user._id, providerId });
    return true;
  },
});

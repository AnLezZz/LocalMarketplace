import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { withPhotoUrl } from "./model/photos";

/** Which of these providers the signed-in user has saved (for heart state): an indexed look-up per id, so it works however many they have saved. */
export const savedAmong = query({
  args: { providerIds: v.array(v.id("providers")) },
  handler: async (ctx, { providerIds }) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const saved = await Promise.all(providerIds.slice(0, 50).map(async (providerId) =>
      (await ctx.db.query("favourites").withIndex("by_user_and_provider", (q) => q.eq("userId", user._id).eq("providerId", providerId)).take(1)).length ? providerId : null));
    return saved.filter((id): id is NonNullable<typeof id> => id !== null);
  },
});

/** Saved providers, newest saved first, a page at a time. Ones that are no longer approved are left out (so a page can be a little short). */
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getUser(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const r = await ctx.db.query("favourites").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").paginate(paginationOpts);
    const providers = await Promise.all(r.page.map((f) => ctx.db.get(f.providerId)));
    return { ...r, page: await Promise.all(providers.filter((p): p is NonNullable<typeof p> => !!p?.approved).map((p) => withPhotoUrl(ctx, p))) };
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

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";

/** Newest reviews of a provider, for their public profile. */
export const forProvider = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, { providerId }) => {
    const provider = await ctx.db.get(providerId);
    if (!provider?.approved) return [];
    const rows = await ctx.db.query("reviews").withIndex("by_provider", (q) => q.eq("providerId", providerId)).order("desc").take(50);
    return rows.map((r) => ({ _id: r._id, customerName: r.customerName, rating: r.rating, text: r.text, at: r._creationTime }));
  },
});

/** The signed-in customer's reviews, keyed by booking so My bookings can show "Reviewed". */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("reviews").withIndex("by_customer", (q) => q.eq("customerId", user._id)).take(200);
    return rows.map((r) => ({ bookingId: r.bookingId, rating: r.rating }));
  },
});

export const create = mutation({
  args: { bookingId: v.id("bookings"), rating: v.number(), text: v.string() },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const booking = await ctx.db.get(a.bookingId);
    // Strangers learn nothing about other people's bookings.
    if (!booking || booking.customerId !== user._id) throw new ConvexError("booking not found");
    if (booking.status !== "completed") throw new ConvexError("You can review a booking once it is completed");
    if (!Number.isInteger(a.rating) || a.rating < 1 || a.rating > 5) throw new ConvexError("Choose 1 to 5 stars");
    const text = a.text.trim();
    if (text.length > 1000) throw new ConvexError("That review is too long");
    const existing = await ctx.db.query("reviews").withIndex("by_booking", (q) => q.eq("bookingId", booking._id)).first();
    if (existing) throw new ConvexError("You have already reviewed this booking");
    const provider = await ctx.db.get(booking.providerId);
    if (!provider) throw new ConvexError("booking not found");
    const name = (user.name ?? booking.customerName).trim().split(/\s+/)[0] || "Customer";
    await ctx.db.insert("reviews", { bookingId: booking._id, providerId: provider._id, customerId: user._id, customerName: name, rating: a.rating, text });
    // Incremental, so any rating already on the profile keeps its weight.
    const count = provider.reviewCount + 1;
    await ctx.db.patch(provider._id, { reviewCount: count, ratingAvg: Math.round(((provider.ratingAvg * provider.reviewCount + a.rating) / count) * 100) / 100 });
  },
});

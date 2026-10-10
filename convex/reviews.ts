import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { notify } from "./model/notify";
import { withReview } from "./model/reviewStats";

/** Newest reviews of a provider for their public profile, a page at a time (hidden reviews are left out in the database, so pages stay full). */
export const forProvider = query({
  args: { providerId: v.id("providers"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { providerId, paginationOpts }) => {
    const provider = await ctx.db.get(providerId);
    if (!provider?.approved) return { page: [], isDone: true, continueCursor: "" };
    const opts = { ...paginationOpts, numItems: Math.min(Math.max(paginationOpts.numItems, 1), 50) };
    const r = await ctx.db.query("reviews").withIndex("by_provider", (q) => q.eq("providerId", providerId)).order("desc").filter((f) => f.neq(f.field("hidden"), true)).paginate(opts);
    return { ...r, page: r.page.map((x) => ({ _id: x._id, customerName: x.customerName, rating: x.rating, text: x.text, at: x._creationTime })) };
  },
});

const REVIEW_POOL = 500;

/**
 * A numbered page of a provider's public reviews, with the true total, for the "all reviews" page. Hidden reviews are left out.
 * Looks at up to REVIEW_POOL visible reviews; past that `capped` is true and the total is "at least".
 */
export const forProviderPage = query({
  args: { providerId: v.id("providers"), offset: v.number(), limit: v.number() },
  handler: async (ctx, { providerId, offset, limit }) => {
    const provider = await ctx.db.get(providerId);
    if (!provider?.approved) return { rows: [], total: 0, capped: false };
    const all = await ctx.db.query("reviews").withIndex("by_provider", (q) => q.eq("providerId", providerId)).order("desc").filter((f) => f.neq(f.field("hidden"), true)).take(REVIEW_POOL + 1);
    const from = Math.max(0, Math.floor(offset)), size = Math.min(50, Math.max(1, Math.floor(limit)));
    return {
      rows: all.slice(from, from + size).map((x) => ({ _id: x._id, customerName: x.customerName, rating: x.rating, text: x.text, at: x._creationTime })),
      total: Math.min(all.length, REVIEW_POOL), capped: all.length > REVIEW_POOL,
    };
  },
});

/** The signed-in provider's own reviews, newest first, a page at a time (hidden ones are left out, as on their public profile). */
export const minePage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getUser(ctx);
    const provider = user && (await ctx.db.query("providers").withIndex("by_userId", (q) => q.eq("userId", user._id)).first());
    if (!provider) return { page: [], isDone: true, continueCursor: "" };
    const opts = { ...paginationOpts, numItems: Math.min(Math.max(paginationOpts.numItems, 1), 50) };
    const result = await ctx.db.query("reviews").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).order("desc").filter((f) => f.neq(f.field("hidden"), true)).paginate(opts);
    return { ...result, page: result.page.map((r) => ({ _id: r._id, customerName: r.customerName, rating: r.rating, text: r.text, at: r._creationTime })) };
  },
});

/** The signed-in customer's rating of one booking, or null. Cheap, and not limited to their newest reviews. */
export const forBooking = query({
  args: { bookingId: v.string() },
  handler: async (ctx, { bookingId }) => {
    const user = await getUser(ctx);
    const id = ctx.db.normalizeId("bookings", bookingId);
    if (!user || !id) return null;
    const review = (await ctx.db.query("reviews").withIndex("by_booking", (q) => q.eq("bookingId", id)).take(1))[0];
    return review && review.customerId === user._id ? { rating: review.rating } : null;
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
    await notify(ctx, provider.userId, { kind: "review_received", title: "New review", body: `${name} left ${a.rating} ${a.rating === 1 ? "star" : "stars"}.`, href: "/provider/reviews" });
    // Incremental, so any rating already on the profile keeps its weight.
    await ctx.db.patch(provider._id, withReview(provider, a.rating));
  },
});

/** The provider asks admins to look at a review of their business. One open report per review. */
export const report = mutation({
  args: { reviewId: v.id("reviews"), reason: v.string() },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const review = await ctx.db.get(a.reviewId);
    const provider = review ? await ctx.db.get(review.providerId) : null;
    // Only the owner of the reviewed business may report; everyone else learns nothing.
    if (!review || !provider || provider.userId !== user._id || review.hidden) throw new ConvexError("review not found");
    const reason = a.reason.trim();
    if (reason.length < 10) throw new ConvexError("Tell us what is wrong with this review (at least 10 characters)");
    if (reason.length > 500) throw new ConvexError("That reason is too long");
    const open = await ctx.db.query("reviewReports").withIndex("by_review", (q) => q.eq("reviewId", review._id)).take(20);
    if (open.some((x) => x.status === "open")) throw new ConvexError("This review has already been reported");
    return await ctx.db.insert("reviewReports", { reviewId: review._id, providerId: provider._id, reporterId: user._id, reason, status: "open" });
  },
});

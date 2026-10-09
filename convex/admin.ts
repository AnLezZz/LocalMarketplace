import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./model/auth";
import { providerStatus } from "./model/providers";

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db
      .query("providers")
      .withIndex("by_approved_and_reviewedAt", (q) => q.eq("approved", false).eq("reviewedAt", undefined))
      .take(100);
    return await Promise.all(
      rows.map(async (p) => ({ ...p, ownerEmail: p.userId ? ((await ctx.db.get(p.userId))?.email ?? null) : null })),
    );
  },
});

export const review = mutation({
  args: {
    providerId: v.id("providers"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requireRole(ctx, "admin");
    const p = await ctx.db.get(a.providerId);
    if (!p) throw new ConvexError("Provider not found");
    if (providerStatus(p) !== "pending") throw new ConvexError("Already reviewed");
    if (a.decision === "approve") {
      await ctx.db.patch(p._id, { approved: true, reviewedAt: Date.now(), rejectionReason: undefined });
    } else {
      const reason = a.reason?.trim();
      if (!reason) throw new ConvexError("A reason is required to reject");
      await ctx.db.patch(p._id, { reviewedAt: Date.now(), rejectionReason: reason });
    }
    return null;
  },
});

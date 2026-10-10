import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./model/auth";
import { providerStatus, type ProviderStatus } from "./model/providers";
import { audit } from "./model/audit";
import { notify } from "./model/notify";
import { withReview, withoutReview } from "./model/reviewStats";
import { latestDispute } from "./model/disputes";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
    // The version the admin read (from listPending). Stale means the applicant edited since.
    submittedAt: v.number(),
  },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const p = await ctx.db.get(a.providerId);
    if (!p) throw new ConvexError("Provider not found");
    if (providerStatus(p) !== "pending") throw new ConvexError("Already reviewed");
    if (p.userId === admin._id) throw new ConvexError("You can't review your own application");
    if (p.submittedAt !== a.submittedAt) throw new ConvexError("This application changed. Reload and review again.");
    if (a.decision === "approve") {
      await ctx.db.patch(p._id, { approved: true, reviewedAt: Date.now(), rejectionReason: undefined });
      await audit(ctx, admin._id, "provider.approve", "provider", p._id);
    } else {
      const reason = a.reason?.trim();
      if (!reason) throw new ConvexError("A reason is required to reject");
      await ctx.db.patch(p._id, { reviewedAt: Date.now(), rejectionReason: reason });
      await audit(ctx, admin._id, "provider.reject", "provider", p._id, reason);
    }
    return null;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const providers = await ctx.db
      .query("providers")
      .withIndex("by_approved", (q) => q.eq("approved", true))
      .take(500);

    const pending = await ctx.db
      .query("providers")
      .withIndex("by_approved_and_reviewedAt", (q) => q.eq("approved", false).eq("reviewedAt", undefined))
      .take(100);

    const bookings = await ctx.db.query("bookings").take(500);

    const totalRatings = providers.reduce((acc, p) => acc + (p.ratingAvg || 0), 0);
    const averageRating = providers.length > 0 ? Number((totalRatings / providers.length).toFixed(1)) : 0;

    return {
      totalProviders: providers.length,
      totalBookings: bookings.length,
      averageRating,
      pendingApprovals: pending.length,
    };
  },
});

export const listRecentBookings = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const bookings = await ctx.db.query("bookings").order("desc").take(20);
    return await Promise.all(
      bookings.map(async (b) => {
        const provider = await ctx.db.get(b.providerId);
        return {
          ...b,
          providerName: provider?.name ?? "Unknown provider",
          service: provider?.category ?? "General service",
        };
      })
    );
  },
});


const reasonOf = (s: string | undefined, min = 5) => {
  const r = (s ?? "").trim();
  if (r.length < min) throw new ConvexError(`Give a reason (at least ${min} characters)`);
  if (r.length > 500) throw new ConvexError("That reason is too long");
  return r;
};
const includes = (hay: (string | undefined | null)[], q: string | undefined) => !q || hay.some((h) => h?.toLowerCase().includes(q.trim().toLowerCase()));

async function suspendProviderDoc(ctx: MutationCtx, adminId: Id<"users">, p: Doc<"providers">, reason: string) {
  await ctx.db.patch(p._id, { approved: false, suspendedAt: Date.now(), suspendedReason: reason });
  await audit(ctx, adminId, "provider.suspend", "provider", p._id, reason);
  await notify(ctx, p.userId, { kind: "provider_suspended", title: "Your listing was suspended", body: `Your Localo listing is hidden. Reason: ${reason}`, href: "/provider" });
}

// ---------- providers ----------

export const listProviders = query({
  args: { status: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { status, q }) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db.query("providers").order("desc").take(300);
    const out = [];
    for (const p of rows) {
      const st: ProviderStatus = providerStatus(p);
      if (status && st !== status) continue;
      const owner = p.userId ? await ctx.db.get(p.userId) : null;
      if (!includes([p.name, p.suburb, p.category, owner?.email], q)) continue;
      out.push({ _id: p._id, name: p.name, category: p.category, suburb: p.suburb, status: st, ownerEmail: owner?.email ?? null, ratingAvg: p.ratingAvg, reviewCount: p.reviewCount, suspendedReason: p.suspendedReason, rejectionReason: p.rejectionReason });
    }
    return out;
  },
});

export const suspendProvider = mutation({
  args: { providerId: v.id("providers"), reason: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const p = await ctx.db.get(a.providerId);
    if (!p) throw new ConvexError("Provider not found");
    if (providerStatus(p) !== "approved") throw new ConvexError("Only approved providers can be suspended");
    if (p.userId === admin._id) throw new ConvexError("You can't suspend your own listing");
    await suspendProviderDoc(ctx, admin._id, p, reasonOf(a.reason));
  },
});

export const reactivateProvider = mutation({
  args: { providerId: v.id("providers"), note: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const p = await ctx.db.get(a.providerId);
    if (!p || p.suspendedAt === undefined) throw new ConvexError("That provider is not suspended");
    const owner = p.userId ? await ctx.db.get(p.userId) : null;
    if (owner?.suspendedAt !== undefined) throw new ConvexError("Reactivate the owner's account first");
    await ctx.db.patch(p._id, { approved: true, suspendedAt: undefined, suspendedReason: undefined });
    await audit(ctx, admin._id, "provider.reactivate", "provider", p._id, a.note?.trim() || undefined);
    await notify(ctx, p.userId, { kind: "provider_reactivated", title: "Your listing is live again", body: "Your Localo listing is visible and can take bookings again.", href: "/provider" });
  },
});

// ---------- customers and other accounts ----------

export const listUsers = query({
  args: { status: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { status, q }) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db.query("users").order("desc").take(300);
    return rows
      .filter((u) => (status === "suspended" ? u.suspendedAt !== undefined : status === "active" ? u.suspendedAt === undefined : true) && includes([u.name, u.email], q))
      .map((u) => ({ _id: u._id, name: u.name ?? null, email: u.email ?? null, role: u.role, joined: u._creationTime, suspendedAt: u.suspendedAt, suspendedReason: u.suspendedReason }));
  },
});

export const suspendUser = mutation({
  args: { userId: v.id("users"), reason: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const u = await ctx.db.get(a.userId);
    if (!u) throw new ConvexError("User not found");
    if (u._id === admin._id) throw new ConvexError("You can't suspend yourself");
    if (u.role === "admin") throw new ConvexError("Admins can't be suspended here");
    if (u.suspendedAt !== undefined) throw new ConvexError("Already suspended");
    const reason = reasonOf(a.reason);
    await ctx.db.patch(u._id, { suspendedAt: Date.now(), suspendedReason: reason });
    await audit(ctx, admin._id, "user.suspend", "user", u._id, reason);
    await notify(ctx, u._id, { kind: "account_suspended", title: "Your account was suspended", body: `Reason: ${reason}`, href: "/" });
    // Their listing goes with them, so a suspended person cannot keep taking bookings.
    const provider = (await ctx.db.query("providers").withIndex("by_userId", (q) => q.eq("userId", u._id)).take(1))[0];
    if (provider && providerStatus(provider) === "approved") await suspendProviderDoc(ctx, admin._id, provider, `Owner account suspended: ${reason}`);
  },
});

/** Reactivates the account only. A listing suspended with it is brought back separately, on purpose. */
export const reactivateUser = mutation({
  args: { userId: v.id("users"), note: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const u = await ctx.db.get(a.userId);
    if (!u || u.suspendedAt === undefined) throw new ConvexError("That account is not suspended");
    await ctx.db.patch(u._id, { suspendedAt: undefined, suspendedReason: undefined });
    await audit(ctx, admin._id, "user.reactivate", "user", u._id, a.note?.trim() || undefined);
    await notify(ctx, u._id, { kind: "account_reactivated", title: "Your account is active again", body: "You can use Localo as normal.", href: "/" });
  },
});

// ---------- bookings ----------

export const listBookings = query({
  args: { status: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { status, q }) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db.query("bookings").order("desc").take(300);
    const out = [];
    for (const b of rows) {
      if (status && b.status !== status) continue;
      const provider = await ctx.db.get(b.providerId);
      if (!includes([b.customerName, provider?.name, b.serviceName, b.description, b.suburb], q)) continue;
      const d = await latestDispute(ctx, b._id);
      out.push({ _id: b._id, customerName: b.customerName, providerName: provider?.name ?? "Unknown", serviceName: b.serviceName, status: b.status, startsAt: b.startsAt, suburb: b.suburb, disputeOpen: d?.status === "open" });
    }
    return out;
  },
});

/** Everything about a booking, for investigating a dispute. Admins see the full address and contact details. */
export const getBooking = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireRole(ctx, "admin");
    const bid = ctx.db.normalizeId("bookings", id);
    const b = bid ? await ctx.db.get(bid) : null;
    if (!b) return null;
    const provider = await ctx.db.get(b.providerId);
    const events = await ctx.db.query("bookingEvents").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).take(50);
    const disputes = await ctx.db.query("disputes").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).order("desc").take(20);
    return {
      ...b, providerName: provider?.name ?? "Unknown", providerId: b.providerId,
      events: events.map((e) => ({ at: e._creationTime, from: e.fromStatus, to: e.toStatus, by: e.actorId === b.customerId ? "customer" : e.actorId === provider?.userId ? "provider" : "admin" })),
      disputes: disputes.map((d) => ({ _id: d._id, status: d.status, reason: d.reason, openedBy: d.openedBy, resolution: d.resolution, at: d._creationTime })),
    };
  },
});

/** Last resort for a stuck or abusive booking. Both sides are told why. */
export const cancelBooking = mutation({
  args: { bookingId: v.id("bookings"), reason: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const b = await ctx.db.get(a.bookingId);
    if (!b) throw new ConvexError("Booking not found");
    if (b.status !== "requested" && b.status !== "accepted") throw new ConvexError("Only open bookings can be cancelled");
    const reason = reasonOf(a.reason);
    await ctx.db.patch(b._id, { status: "cancelled" });
    await ctx.db.insert("bookingEvents", { bookingId: b._id, actorId: admin._id, fromStatus: b.status, toStatus: "cancelled" });
    await audit(ctx, admin._id, "booking.cancel", "booking", b._id, reason);
    const provider = await ctx.db.get(b.providerId);
    const body = `An admin cancelled ${b.serviceName ?? "the booking"}. Reason: ${reason}`;
    await notify(ctx, b.customerId, { kind: "booking_cancelled", title: "Booking cancelled by Localo", body, href: `/bookings/${b._id}` });
    await notify(ctx, provider?.userId, { kind: "booking_cancelled", title: "Booking cancelled by Localo", body, href: `/provider/bookings/${b._id}` });
  },
});

// ---------- review reports and moderation ----------

async function hideReviewDoc(ctx: MutationCtx, adminId: Id<"users">, review: Doc<"reviews">, reason: string) {
  if (review.hidden) throw new ConvexError("Already hidden");
  await ctx.db.patch(review._id, { hidden: true, hiddenReason: reason });
  const provider = await ctx.db.get(review.providerId);
  if (provider) await ctx.db.patch(provider._id, withoutReview(provider, review.rating));
  await audit(ctx, adminId, "review.hide", "review", review._id, reason);
  await notify(ctx, review.customerId, { kind: "review_hidden", title: "Your review was removed", body: `It broke our review rules. Reason: ${reason}`, href: "/bookings?tab=past" });
}

export const listReviewReports = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireRole(ctx, "admin");
    const st = status === "dismissed" || status === "upheld" ? status : "open";
    const rows = await ctx.db.query("reviewReports").withIndex("by_status", (q) => q.eq("status", st)).order("desc").take(100);
    const out = [];
    for (const r of rows) {
      const review = await ctx.db.get(r.reviewId), provider = await ctx.db.get(r.providerId);
      if (!review) continue;
      out.push({ _id: r._id, reason: r.reason, status: r.status, resolutionNote: r.resolutionNote, at: r._creationTime, providerName: provider?.name ?? "Unknown",
        review: { _id: review._id, rating: review.rating, text: review.text, customerName: review.customerName, hidden: !!review.hidden, hiddenReason: review.hiddenReason } });
    }
    return out;
  },
});

export const resolveReviewReport = mutation({
  args: { reportId: v.id("reviewReports"), action: v.union(v.literal("hide"), v.literal("dismiss")), note: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const report = await ctx.db.get(a.reportId);
    if (!report || report.status !== "open") throw new ConvexError("That report is already resolved");
    const review = await ctx.db.get(report.reviewId);
    if (!review) throw new ConvexError("Review not found");
    const note = a.action === "hide" ? reasonOf(a.note) : (a.note ?? "").trim().slice(0, 500) || undefined;
    if (a.action === "hide") await hideReviewDoc(ctx, admin._id, review, note!);
    await ctx.db.patch(report._id, { status: a.action === "hide" ? "upheld" : "dismissed", resolvedById: admin._id, resolutionNote: note });
    await audit(ctx, admin._id, a.action === "hide" ? "report.uphold" : "report.dismiss", "report", report._id, note);
    const provider = await ctx.db.get(report.providerId);
    await notify(ctx, report.reporterId, {
      kind: "report_resolved", title: a.action === "hide" ? "The review was removed" : "We kept the review",
      body: a.action === "hide" ? `We removed the review you reported. ${note}` : `We looked into your report about a review of ${provider?.name ?? "your business"} and it stays up.${note ? ` ${note}` : ""}`, href: "/provider/reviews",
    });
  },
});

export const listHiddenReviews = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db.query("reviews").order("desc").take(300);
    const hidden = rows.filter((r) => r.hidden);
    return await Promise.all(hidden.map(async (r) => ({ _id: r._id, rating: r.rating, text: r.text, customerName: r.customerName, hiddenReason: r.hiddenReason, providerName: (await ctx.db.get(r.providerId))?.name ?? "Unknown" })));
  },
});

export const restoreReview = mutation({
  args: { reviewId: v.id("reviews"), note: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const review = await ctx.db.get(a.reviewId);
    if (!review?.hidden) throw new ConvexError("That review is not hidden");
    await ctx.db.patch(review._id, { hidden: false, hiddenReason: undefined });
    const provider = await ctx.db.get(review.providerId);
    if (provider) await ctx.db.patch(provider._id, withReview(provider, review.rating));
    await audit(ctx, admin._id, "review.restore", "review", review._id, a.note?.trim() || undefined);
  },
});

// ---------- disputes ----------

export const listDisputes = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireRole(ctx, "admin");
    const st = status === "resolved" ? "resolved" : "open";
    const rows = await ctx.db.query("disputes").withIndex("by_status", (q) => q.eq("status", st)).order("desc").take(100);
    return await Promise.all(rows.map(async (d) => {
      const b = await ctx.db.get(d.bookingId), provider = b ? await ctx.db.get(b.providerId) : null;
      return { _id: d._id, bookingId: d.bookingId, reason: d.reason, openedBy: d.openedBy, status: d.status, resolution: d.resolution, at: d._creationTime, customerName: b?.customerName ?? "Unknown", providerName: provider?.name ?? "Unknown", serviceName: b?.serviceName };
    }));
  },
});

export const resolveDispute = mutation({
  args: { disputeId: v.id("disputes"), resolution: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const d = await ctx.db.get(a.disputeId);
    if (!d || d.status !== "open") throw new ConvexError("That dispute is already resolved");
    const resolution = reasonOf(a.resolution, 10);
    await ctx.db.patch(d._id, { status: "resolved", resolution, resolvedById: admin._id });
    await audit(ctx, admin._id, "dispute.resolve", "dispute", d._id, resolution);
    const b = await ctx.db.get(d.bookingId), provider = b ? await ctx.db.get(b.providerId) : null;
    if (b) {
      const body = `An admin looked into the problem with ${b.serviceName ?? "the booking"}: ${resolution}`;
      await notify(ctx, b.customerId, { kind: "dispute_resolved", title: "Your dispute was resolved", body, href: `/bookings/${b._id}` });
      await notify(ctx, provider?.userId, { kind: "dispute_resolved", title: "A dispute was resolved", body, href: `/provider/bookings/${b._id}` });
    }
  },
});

// ---------- audit log ----------

export const listAudit = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db.query("auditLog").order("desc").take(100);
    return await Promise.all(rows.map(async (r) => {
      const actor = await ctx.db.get(r.actorId);
      return { _id: r._id, at: r._creationTime, action: r.action, targetType: r.targetType, targetId: r.targetId, reason: r.reason, actor: actor?.name ?? actor?.email ?? "Unknown" };
    }));
  },
});

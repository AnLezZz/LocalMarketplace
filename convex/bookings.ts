import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";

// requested → accepted/declined/cancelled; accepted → completed/cancelled
const TRANSITIONS: Record<string, string[]> = {
  requested: ["accepted", "declined", "cancelled"],
  accepted: ["completed", "cancelled"],
};

export const create = mutation({
  args: {
    providerId: v.string(), customerName: v.string(), customerEmail: v.string(),
    description: v.string(), startsAt: v.number(), endsAt: v.number(),
  },
  handler: async (ctx, a) => {
    const providerId = ctx.db.normalizeId("providers", a.providerId);
    const provider = providerId && (await ctx.db.get(providerId));
    if (!providerId || !provider?.approved) throw new Error("provider not found");
    if (!(a.endsAt > a.startsAt) || a.startsAt < Date.now()) throw new Error("invalid time window");
    if (!a.customerName.trim() || !/^\S+@\S+\.\S+$/.test(a.customerEmail) || !a.description.trim()) {
      throw new Error("missing fields");
    }
    const id = await ctx.db.insert("bookings", {
      providerId, customerName: a.customerName.trim(), customerEmail: a.customerEmail.trim(),
      description: a.description.trim(), startsAt: a.startsAt, endsAt: a.endsAt, status: "requested",
    });
    await ctx.db.insert("bookingEvents", { bookingId: id, toStatus: "requested" });
    return id;
  },
});

// TEMPORARY: unauthenticated, keyed by provider id. Replace with real auth before real users.
export const listForProvider = query({
  args: { providerId: v.string() },
  handler: async (ctx, { providerId }) => {
    const pid = ctx.db.normalizeId("providers", providerId);
    if (!pid) return [];
    const rows = await ctx.db.query("bookings").withIndex("by_provider", (i) => i.eq("providerId", pid)).collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/** Convex mutations are serializable transactions, so the overlap check + write below is atomic. */
export const transition = mutation({
  args: { bookingId: v.string(), providerId: v.string(), to: v.string() },
  handler: async (ctx, a) => {
    const bid = ctx.db.normalizeId("bookings", a.bookingId);
    const pid = ctx.db.normalizeId("providers", a.providerId);
    const b = bid && (await ctx.db.get(bid));
    if (!bid || !pid || !b || b.providerId !== pid) return { ok: false as const, reason: "not found" };
    if (!TRANSITIONS[b.status]?.includes(a.to)) return { ok: false as const, reason: `cannot go ${b.status} → ${a.to}` };
    if (a.to === "accepted") {
      const mine = await ctx.db.query("bookings").withIndex("by_provider", (i) => i.eq("providerId", pid)).collect();
      const clash = mine.some((o) => o._id !== bid && (o.status === "accepted" || o.status === "completed")
        && o.startsAt < b.endsAt && b.startsAt < o.endsAt);
      if (clash) return { ok: false as const, reason: "time conflicts with another accepted booking" };
    }
    await ctx.db.patch(bid, { status: a.to as any });
    await ctx.db.insert("bookingEvents", { bookingId: bid, fromStatus: b.status, toStatus: a.to });
    return { ok: true as const };
  },
});

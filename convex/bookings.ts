import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { canTransition, type Actor } from "./model/bookingRules";
import { getProviderForUser } from "./model/providers";

export const create = mutation({
  args: {
    providerId: v.id("providers"), customerName: v.string(), description: v.string(),
    startsAt: v.number(), endsAt: v.number(),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    if (!user.email) throw new ConvexError("Your account needs an email address");
    const provider = await ctx.db.get(a.providerId);
    if (!provider?.approved) throw new ConvexError("provider not found");
    if (provider.userId === user._id) throw new ConvexError("You can't book yourself");
    if (!(a.endsAt > a.startsAt) || a.startsAt < Date.now()) throw new ConvexError("invalid time window");
    const customerName = a.customerName.trim();
    const description = a.description.trim();
    if (!customerName || !description) throw new ConvexError("missing fields");
    if (customerName.length > 100 || description.length > 2000) throw new ConvexError("One of the fields is too long");
    const id = await ctx.db.insert("bookings", {
      providerId: provider._id, customerId: user._id, customerName, customerEmail: user.email,
      description, startsAt: a.startsAt, endsAt: a.endsAt, status: "requested",
    });
    await ctx.db.insert("bookingEvents", { bookingId: id, actorId: user._id, toStatus: "requested" });
    return id;
  },
});

/** Requests for the signed-in user's own provider profile. */
export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const provider = await getProviderForUser(ctx, user._id);
    if (!provider) return [];
    return await ctx.db
      .query("bookings")
      .withIndex("by_provider", (i) => i.eq("providerId", provider._id))
      .order("desc")
      .take(200);
  },
});

/** Bookings the signed-in user has requested as a customer. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_customerId", (i) => i.eq("customerId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (b) => ({ ...b, providerName: (await ctx.db.get(b.providerId))?.name ?? "Unknown provider" })),
    );
  },
});

/** Convex mutations are serializable transactions, so the overlap check + write below is atomic. */
export const transition = mutation({
  args: {
    bookingId: v.id("bookings"),
    to: v.union(v.literal("accepted"), v.literal("declined"), v.literal("cancelled"), v.literal("completed")),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(a.bookingId);
    if (!b) return { ok: false as const, reason: "not found" };
    const provider = await ctx.db.get(b.providerId);
    const actor: Actor | null =
      provider?.userId === user._id ? "provider" : b.customerId === user._id ? "customer" : null;
    // Strangers learn nothing about whether the booking exists.
    if (!actor) return { ok: false as const, reason: "not found" };
    if (!canTransition(actor, b.status, a.to)) {
      return { ok: false as const, reason: `cannot go ${b.status} → ${a.to}` };
    }
    if (a.to === "accepted") {
      // Unbounded on purpose: a bounded read could miss a conflict and double-book. Revisit with a
      // by_provider_and_status index in Phase 1.
      const mine = await ctx.db.query("bookings").withIndex("by_provider", (i) => i.eq("providerId", b.providerId)).collect();
      const clash = mine.some((o) => o._id !== b._id && (o.status === "accepted" || o.status === "completed")
        && o.startsAt < b.endsAt && b.startsAt < o.endsAt);
      if (clash) return { ok: false as const, reason: "time conflicts with another accepted booking" };
    }
    await ctx.db.patch(b._id, { status: a.to });
    await ctx.db.insert("bookingEvents", { bookingId: b._id, actorId: user._id, fromStatus: b.status, toStatus: a.to });
    return { ok: true as const };
  },
});

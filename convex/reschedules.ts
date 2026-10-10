import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./model/auth";
import { notify } from "./model/notify";
import { isTimeAvailable } from "./model/availability";

const MINUTE = 60_000;

/** Who the signed-in user is on a booking. Anyone else learns nothing about it. */
async function participant(ctx: Parameters<typeof requireUser>[0], bookingId: Id<"bookings">) {
  const user = await requireUser(ctx);
  const b = await ctx.db.get(bookingId);
  const provider = b ? await ctx.db.get(b.providerId) : null;
  const role = b && provider ? (b.customerId === user._id ? "customer" as const : provider.userId === user._id ? "provider" as const : null) : null;
  if (!b || !provider || !role) throw new ConvexError("booking not found");
  return { user, b, provider, role };
}

/** Propose a new start time for an accepted booking that has not started. The duration stays the same. */
export const propose = mutation({
  args: { bookingId: v.id("bookings"), newStartsAt: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const { user, b, provider, role } = await participant(ctx, a.bookingId);
    if (b.status !== "accepted") throw new ConvexError("Only an accepted booking can be rescheduled");
    if (b.startsAt <= Date.now()) throw new ConvexError("This booking has already started");
    if (role === "provider" && !provider.approved) throw new ConvexError("Your listing is not currently active");
    if (!Number.isFinite(a.newStartsAt) || a.newStartsAt <= Date.now()) throw new ConvexError("Pick a time in the future");
    if (Math.abs(a.newStartsAt - b.startsAt) < MINUTE) throw new ConvexError("That is the time it already has");
    const note = (a.note ?? "").trim();
    if (note.length > 300) throw new ConvexError("That note is too long");
    const open = await ctx.db.query("rescheduleRequests").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).take(20);
    if (open.some((r) => r.status === "pending")) throw new ConvexError("There is already a pending request. Withdraw it or wait for a reply.");
    const newEndsAt = a.newStartsAt + (b.endsAt - b.startsAt);
    if (!(await isTimeAvailable(ctx, b.providerId, a.newStartsAt, newEndsAt, b._id))) throw new ConvexError("That time isn't available");
    const id = await ctx.db.insert("rescheduleRequests", { bookingId: b._id, proposedBy: role, proposerId: user._id, newStartsAt: a.newStartsAt, newEndsAt, status: "pending", ...(note ? { note } : {}) });
    const what = b.serviceName ?? "the booking";
    if (role === "customer") await notify(ctx, provider.userId, { kind: "reschedule_requested", title: "Reschedule requested", body: `${b.customerName} asked to move ${what}.`, href: `/provider/bookings/${b._id}` });
    else await notify(ctx, b.customerId, { kind: "reschedule_requested", title: "Reschedule requested", body: `${provider.name} asked to move ${what}.`, href: `/bookings/${b._id}` });
    return id;
  },
});

/** The other side accepts (the booking moves) or declines (nothing changes). */
export const respond = mutation({
  args: { requestId: v.id("rescheduleRequests"), accept: v.boolean() },
  handler: async (ctx, a) => {
    const req = await ctx.db.get(a.requestId);
    if (!req) throw new ConvexError("request not found");
    const { b, provider, role } = await participant(ctx, req.bookingId);
    if (role === req.proposedBy) throw new ConvexError("The other side has to answer your request");
    if (req.status !== "pending") throw new ConvexError("That request has already been answered");
    if (b.status !== "accepted") throw new ConvexError("This booking can no longer be moved");
    if (role === "provider" && !provider.approved) throw new ConvexError("Your listing is not currently active");
    const who = role === "customer" ? b.customerName : provider.name;
    const proposer = req.proposedBy === "customer" ? b.customerId : provider.userId;
    if (!a.accept) {
      await ctx.db.patch(req._id, { status: "declined" });
      await notify(ctx, proposer, { kind: "reschedule_declined", title: "Reschedule declined", body: `${who} kept the original time for ${b.serviceName ?? "the booking"}.`, href: req.proposedBy === "customer" ? `/bookings/${b._id}` : `/provider/bookings/${b._id}` });
      return { ok: true as const };
    }
    // Availability may have changed since it was proposed.
    if (req.newStartsAt <= Date.now() || !(await isTimeAvailable(ctx, b.providerId, req.newStartsAt, req.newEndsAt, b._id))) {
      return { ok: false as const, reason: "That time is no longer available. Ask for another." };
    }
    await ctx.db.patch(b._id, { startsAt: req.newStartsAt, endsAt: req.newEndsAt, reminderSentAt: undefined });
    await ctx.db.patch(req._id, { status: "accepted" });
    await ctx.db.insert("bookingEvents", { bookingId: b._id, actorId: req.proposerId, fromStatus: "accepted", toStatus: "rescheduled" });
    await notify(ctx, proposer, { kind: "reschedule_accepted", title: "New time confirmed", body: `${who} agreed to the new time for ${b.serviceName ?? "the booking"}.`, href: req.proposedBy === "customer" ? `/bookings/${b._id}` : `/provider/bookings/${b._id}` });
    return { ok: true as const };
  },
});

/** The proposer takes their request back. */
export const withdraw = mutation({
  args: { requestId: v.id("rescheduleRequests") },
  handler: async (ctx, a) => {
    const req = await ctx.db.get(a.requestId);
    if (!req) throw new ConvexError("request not found");
    const { b, provider, role } = await participant(ctx, req.bookingId);
    if (role !== req.proposedBy) throw new ConvexError("request not found");
    if (req.status !== "pending") throw new ConvexError("That request has already been answered");
    await ctx.db.patch(req._id, { status: "withdrawn" });
    const other = role === "customer" ? provider.userId : b.customerId;
    await notify(ctx, other, { kind: "reschedule_withdrawn", title: "Reschedule request withdrawn", body: `The request to move ${b.serviceName ?? "the booking"} was withdrawn.`, href: role === "customer" ? `/provider/bookings/${b._id}` : `/bookings/${b._id}` });
  },
});

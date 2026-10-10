import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The newest reschedule request on a booking, in the shape both participants may see. */
export async function latestReschedule(ctx: QueryCtx, bookingId: Id<"bookings">) {
  const r = (await ctx.db.query("rescheduleRequests").withIndex("by_booking", (q) => q.eq("bookingId", bookingId)).order("desc").take(1))[0];
  return r ? { _id: r._id, status: r.status, proposedBy: r.proposedBy, newStartsAt: r.newStartsAt, newEndsAt: r.newEndsAt, note: r.note, at: r._creationTime } : undefined;
}

/** A booking that is cancelled or completed can no longer move, so any open request on it is withdrawn. */
export async function withdrawPendingReschedules(ctx: MutationCtx, bookingId: Id<"bookings">) {
  for (const r of await ctx.db.query("rescheduleRequests").withIndex("by_booking", (q) => q.eq("bookingId", bookingId)).take(20)) {
    if (r.status === "pending") await ctx.db.patch(r._id, { status: "withdrawn" });
  }
}

import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** The most recent dispute on a booking, in the shape both participants may see. */
export async function latestDispute(ctx: QueryCtx, bookingId: Id<"bookings">) {
  const d = (await ctx.db.query("disputes").withIndex("by_booking", (q) => q.eq("bookingId", bookingId)).order("desc").take(1))[0];
  return d ? { _id: d._id, status: d.status, reason: d.reason, openedBy: d.openedBy, resolution: d.resolution, at: d._creationTime } : undefined;
}

import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./model/auth";
import { notify } from "./model/notify";

/** Either side of an accepted, completed or cancelled booking can ask admins to step in. One open dispute per booking. */
export const open = mutation({
  args: { bookingId: v.id("bookings"), reason: v.string() },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(a.bookingId);
    const provider = b ? await ctx.db.get(b.providerId) : null;
    const actor = b && provider ? (b.customerId === user._id ? "customer" : provider.userId === user._id ? "provider" : null) : null;
    if (!b || !provider || !actor) throw new ConvexError("booking not found");
    if (b.status === "requested" || b.status === "declined") throw new ConvexError("You can raise a dispute once a booking has been accepted");
    const reason = a.reason.trim();
    if (reason.length < 10) throw new ConvexError("Describe what went wrong (at least 10 characters)");
    if (reason.length > 1000) throw new ConvexError("That description is too long");
    const existing = await ctx.db.query("disputes").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).take(20);
    if (existing.some((d) => d.status === "open")) throw new ConvexError("There is already an open dispute for this booking");
    const id = await ctx.db.insert("disputes", { bookingId: b._id, openedById: user._id, openedBy: actor, reason, status: "open" });
    const other = actor === "customer" ? provider.userId : b.customerId;
    await notify(ctx, other, {
      kind: "dispute_opened", title: "A dispute was opened", body: `${actor === "customer" ? b.customerName : provider.name} raised a problem with ${b.serviceName ?? "a booking"}. An admin will look into it.`,
      href: actor === "customer" ? `/provider/bookings/${b._id}` : `/bookings/${b._id}`,
    });
    return id;
  },
});

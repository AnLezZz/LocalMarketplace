import { internalMutation } from "./_generated/server";
import { notify } from "./model/notify";

const HOUR = 3_600_000;
const when = (ms: number) =>
  new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(ms);

/** Reminds both sides once about accepted bookings that start within 24 hours. Run hourly by crons.ts. */
export const sendDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db.query("bookings")
      .withIndex("by_status_and_startsAt", (q) => q.eq("status", "accepted").gt("startsAt", now).lte("startsAt", now + 24 * HOUR))
      .take(200);
    let sent = 0;
    for (const b of due) {
      if (b.reminderSentAt) continue;
      const provider = await ctx.db.get(b.providerId);
      const what = b.serviceName ?? "your booking";
      await ctx.db.patch(b._id, { reminderSentAt: now });
      await notify(ctx, b.customerId, { kind: "booking_reminder", title: "Reminder: your booking is coming up", body: `${what} with ${provider?.name ?? "your provider"}, ${when(b.startsAt)}.`, href: `/bookings/${b._id}` });
      await notify(ctx, provider?.userId, { kind: "booking_reminder", title: "Reminder: a job is coming up", body: `${what} for ${b.customerName}, ${when(b.startsAt)}.`, href: `/provider/bookings/${b._id}` });
      sent++;
    }
    return sent;
  },
});

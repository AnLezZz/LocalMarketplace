import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type Notice = { kind: string; title: string; body: string; href: string };

export type EmailCategory = "updates" | "reminders" | "reviews" | "always";

/** Which email preference governs a notification. Account-safety messages are never optional. */
export function emailCategory(kind: string): EmailCategory {
  if (kind === "booking_reminder") return "reminders";
  if (kind === "review_received" || kind === "review_hidden" || kind === "report_resolved") return "reviews";
  if (kind === "account_suspended" || kind === "account_reactivated" || kind === "provider_suspended" || kind === "provider_reactivated") return "always";
  return "updates";
}

/**
 * Writes an in-app notification in the same transaction as the event that caused it, and queues an email to the
 * recipient if they have an address. No-op when there is no recipient.
 */
export async function notify(ctx: MutationCtx, userId: Id<"users"> | undefined, n: Notice) {
  if (!userId) return;
  await ctx.db.insert("notifications", { userId, ...n, read: false });
  const user = await ctx.db.get(userId);
  const category = emailCategory(n.kind);
  const wanted = category === "always" || user?.emailPrefs?.[category] !== false;
  const email = user?.email;
  if (email && wanted) await ctx.scheduler.runAfter(0, internal.email.send, { to: email, title: n.title, body: n.body, href: n.href });
}

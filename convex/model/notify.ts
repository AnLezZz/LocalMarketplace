import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type Notice = { kind: string; title: string; body: string; href: string };

/**
 * Writes an in-app notification in the same transaction as the event that caused it, and queues an email to the
 * recipient if they have an address. No-op when there is no recipient.
 */
export async function notify(ctx: MutationCtx, userId: Id<"users"> | undefined, n: Notice) {
  if (!userId) return;
  await ctx.db.insert("notifications", { userId, ...n, read: false });
  const email = (await ctx.db.get(userId))?.email;
  if (email) await ctx.scheduler.runAfter(0, internal.email.send, { to: email, title: n.title, body: n.body, href: n.href });
}

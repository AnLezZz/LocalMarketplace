import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type Notice = { kind: string; title: string; body: string; href: string };

/** Writes an in-app notification in the same transaction as the event that caused it. No-op when there is no recipient. */
export async function notify(ctx: MutationCtx, userId: Id<"users"> | undefined, n: Notice) {
  if (!userId) return;
  await ctx.db.insert("notifications", { userId, ...n, read: false });
}

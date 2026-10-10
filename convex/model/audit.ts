import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Records an admin action. Call it in the same mutation as the action so the two cannot drift apart. */
export async function audit(ctx: MutationCtx, actorId: Id<"users">, action: string, targetType: string, targetId: string, reason?: string) {
  await ctx.db.insert("auditLog", { actorId, action, targetType, targetId, ...(reason ? { reason } : {}) });
}

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;
export type Role = Doc<"users">["role"];

export async function getUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const id = await getAuthUserId(ctx);
  return id ? await ctx.db.get(id) : null;
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getUser(ctx);
  if (!user) throw new ConvexError("Sign in required");
  return user;
}

export async function requireRole(ctx: Ctx, role: Role): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== role) throw new ConvexError("Not allowed");
  return user;
}

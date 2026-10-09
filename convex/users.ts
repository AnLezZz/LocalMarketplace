import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUser } from "./model/auth";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return { id: user._id, name: user.name ?? null, email: user.email ?? null, role: user.role };
  },
});

/** Bootstrap an admin from the CLI: npx convex run users:grantAdmin '{"email":"you@example.nz"}' */
export const grantAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!user) throw new ConvexError("No user with that email. They must sign up first.");
    await ctx.db.patch(user._id, { role: "admin" });
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUser } from "./model/auth";
import { authEmailAvailable, verificationRequired } from "./model/authEmail";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const photo = user.imageStorageId ? await ctx.storage.getUrl(user.imageStorageId) : (user.image ?? null);
    return { id: user._id, name: user.name ?? null, email: user.email ?? null, photo, role: user.role, suspended: user.suspendedAt !== undefined };
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

/** What the sign-in page may offer. Reveals only whether features are on, never any key. */
export const authFeatures = query({
  args: {},
  handler: async () => ({ passwordReset: authEmailAvailable(), emailVerification: verificationRequired() }),
});

/**
 * Before turning on REQUIRE_EMAIL_VERIFICATION on a deployment that already has users, run this once so they are not
 * all asked for a code: npx convex run users:markExistingVerified. Only do it when you trust the existing emails.
 */
export const markExistingVerified = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const account of await ctx.db.query("authAccounts").take(1000)) {
      if (account.provider === "password" && !account.emailVerified) { await ctx.db.patch(account._id, { emailVerified: account.providerAccountId }); n++; }
    }
    return n;
  },
});

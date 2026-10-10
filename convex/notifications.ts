import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";

/** The signed-in user's latest notifications. Reactive: the bell updates without a refresh. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(30);
    return rows.map((n) => ({ _id: n._id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: n.read, at: n._creationTime }));
  },
});

/** Unread count, capped at 100. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return 0;
    return (await ctx.db.query("notifications").withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("read", false)).take(100)).length;
  },
});

export const markRead = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const nid = ctx.db.normalizeId("notifications", id);
    const n = nid ? await ctx.db.get(nid) : null;
    if (!n || n.userId !== user._id) throw new ConvexError("Notification not found");
    if (!n.read) await ctx.db.patch(n._id, { read: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    for (const n of await ctx.db.query("notifications").withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("read", false)).take(200)) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

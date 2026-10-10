import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUser, requireUser } from "./model/auth";

/** The signed-in user's latest notifications. Reactive: the bell updates without a refresh. */
/** Notifications stored before the dashboard was split into pages point at sections that no longer exist. */
const LEGACY_HREFS: Record<string, string> = { "/provider#reviews": "/provider/reviews", "/provider#bookings": "/provider/bookings", "/provider#calendar": "/provider/calendar" };
export const currentHref = (href: string) => LEGACY_HREFS[href] ?? href;

const shape = (n: { _id: string; kind: string; title: string; body: string; href: string; read: boolean; _creationTime: number }) =>
  ({ _id: n._id, kind: n.kind, title: n.title, body: n.body, href: currentHref(n.href), read: n.read, at: n._creationTime });

/** The newest 30, for a quick look (the notifications page uses `listPage`). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return (await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(30)).map(shape);
  },
});

/** The signed-in user's notifications, newest first, a page at a time. Reactive, so the page keeps scrolling and updating live. */
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getUser(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const r = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").paginate(paginationOpts);
    return { ...r, page: r.page.map(shape) };
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

/** Removes one of the caller's own notifications. Someone else's reads as not found. */
export const clear = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const nid = ctx.db.normalizeId("notifications", id);
    const n = nid ? await ctx.db.get(nid) : null;
    if (!n || n.userId !== user._id) throw new ConvexError("Notification not found");
    await ctx.db.delete(n._id);
  },
});

/** Removes up to 200 of the caller's notifications and says whether any are left, so the page can repeat until it is empty. */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id)).take(201);
    for (const n of rows.slice(0, 200)) await ctx.db.delete(n._id);
    return rows.length > 200;
  },
});

const KEEP_DAYS = 60;
const SWEEP_BATCH = 500;

/** Daily sweep: notifications older than 60 days are stale whether or not they were read. Runs again straight away if a batch was full. */
export const sweepOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    const old = await ctx.db.query("notifications").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).take(SWEEP_BATCH);
    for (const n of old) await ctx.db.delete(n._id);
    if (old.length === SWEEP_BATCH) await ctx.scheduler.runAfter(0, internal.notifications.sweepOld, {});
  },
});

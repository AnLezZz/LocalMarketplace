import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./model/auth";
import { getProviderForUser } from "./model/providers";
import { requireOwnProvider } from "./model/services";
import { availabilityFor, utcToLocal, validateHours } from "./model/availability";

const hoursRow = v.object({
  weekday: v.number(), enabled: v.boolean(), startMinute: v.number(), endMinute: v.number(),
  breakStartMinute: v.optional(v.number()), breakEndMinute: v.optional(v.number()),
});

/** The owner's weekly hours and upcoming blocked time. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    const provider = user && (await getProviderForUser(ctx, user._id));
    if (!provider) return null;
    const hours = await ctx.db.query("workingHours").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).take(7);
    const timeOff = await ctx.db.query("timeOff").withIndex("by_provider_and_endsAt", (q) => q.eq("providerId", provider._id).gt("endsAt", Date.now())).take(200);
    return { configured: hours.length > 0, hours: hours.sort((a, b) => a.weekday - b.weekday), timeOff };
  },
});

/** Replaces the owner's weekly hours. Send all seven days. */
export const setHours = mutation({
  args: { hours: v.array(hoursRow) },
  handler: async (ctx, { hours }) => {
    const provider = await requireOwnProvider(ctx);
    if (hours.length !== 7) throw new ConvexError("Send all seven days");
    const rows = validateHours(hours);
    for (const old of await ctx.db.query("workingHours").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).take(7)) await ctx.db.delete(old._id);
    for (const r of rows) await ctx.db.insert("workingHours", { ...r, providerId: provider._id });
  },
});

export const addTimeOff = mutation({
  args: { startsAt: v.number(), endsAt: v.number(), reason: v.optional(v.string()) },
  handler: async (ctx, { startsAt, endsAt, reason }) => {
    const provider = await requireOwnProvider(ctx);
    if (!(endsAt > startsAt) || endsAt < Date.now()) throw new ConvexError("Pick a time range in the future");
    if (endsAt - startsAt > 366 * 86_400_000) throw new ConvexError("That range is too long");
    const note = reason?.trim().slice(0, 100) || undefined;
    const upcoming = await ctx.db.query("timeOff").withIndex("by_provider_and_endsAt", (q) => q.eq("providerId", provider._id).gt("endsAt", Date.now())).take(200);
    if (upcoming.length >= 200) throw new ConvexError("Remove some old blocks first");
    return await ctx.db.insert("timeOff", { providerId: provider._id, startsAt, endsAt, ...(note ? { reason: note } : {}) });
  },
});

export const removeTimeOff = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const provider = await requireOwnProvider(ctx);
    const tid = ctx.db.normalizeId("timeOff", id);
    const row = tid ? await ctx.db.get(tid) : null;
    if (!row || row.providerId !== provider._id) throw new ConvexError("Block not found");
    await ctx.db.delete(row._id);
  },
});

/** What customers see: per day, the working windows and the busy intervals, in Auckland minutes. */
export const forProvider = query({
  args: { providerId: v.id("providers"), days: v.number() },
  handler: async (ctx, { providerId, days }) => {
    const provider = await ctx.db.get(providerId);
    if (!provider?.approved) return { configured: false, days: [] };
    const today = utcToLocal(Date.now()).date;
    return await availabilityFor(ctx, providerId, today, Math.max(1, Math.min(31, Math.floor(days))));
  },
});


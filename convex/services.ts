import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./model/auth";
import { getProviderForUser } from "./model/providers";
import { requireOwnProvider, validateService } from "./model/services";

const priceType = v.union(v.literal("fixed"), v.literal("hourly"), v.literal("quote"));
const fields = { name: v.string(), description: v.string(), priceType, priceCents: v.optional(v.number()), durationMinutes: v.number() };

/** All of the owner's non-archived services, including disabled ones. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    const provider = user && (await getProviderForUser(ctx, user._id));
    if (!provider) return [];
    const rows = await ctx.db.query("services").withIndex("by_provider", (i) => i.eq("providerId", provider._id)).take(100);
    return rows.filter((s) => !s.archived);
  },
});

/** What customers can book: enabled, non-archived services of an approved provider. */
export const listForProvider = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, { providerId }) => {
    const provider = await ctx.db.get(providerId);
    if (!provider?.approved) return [];
    const rows = await ctx.db.query("services").withIndex("by_provider", (i) => i.eq("providerId", providerId)).take(100);
    return rows.filter((s) => s.enabled && !s.archived);
  },
});

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const provider = await requireOwnProvider(ctx);
    return await ctx.db.insert("services", { ...validateService(args), providerId: provider._id, enabled: true, archived: false });
  },
});

/** A service another provider owns looks exactly like one that does not exist. */
async function ownService(ctx: Parameters<typeof requireOwnProvider>[0], id: string) {
  const provider = await requireOwnProvider(ctx);
  const serviceId = ctx.db.normalizeId("services", id);
  const service = serviceId ? await ctx.db.get(serviceId) : null;
  if (!service || service.providerId !== provider._id || service.archived) throw new ConvexError("Service not found");
  return service;
}

export const update = mutation({
  args: { id: v.string(), ...fields },
  handler: async (ctx, { id, ...rest }) => {
    const service = await ownService(ctx, id);
    const next = validateService(rest);
    await ctx.db.replace(service._id, { ...next, providerId: service.providerId, enabled: service.enabled, archived: false });
  },
});

export const setEnabled = mutation({
  args: { id: v.string(), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    const service = await ownService(ctx, id);
    await ctx.db.patch(service._id, { enabled });
  },
});

export const archive = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const service = await ownService(ctx, id);
    await ctx.db.patch(service._id, { archived: true, enabled: false });
  },
});

/** Service names to show as tags in search: enabled, non-archived services of approved providers. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("services").order("desc").take(500);
    const approved = new Map<string, boolean>();
    const out: { providerId: string; name: string; priceType: string; priceCents?: number }[] = [];
    for (const s of rows) {
      if (!s.enabled || s.archived) continue;
      if (!approved.has(s.providerId)) approved.set(s.providerId, !!(await ctx.db.get(s.providerId))?.approved);
      if (approved.get(s.providerId)) out.push({ providerId: s.providerId, name: s.name, priceType: s.priceType, priceCents: s.priceCents });
    }
    return out;
  },
});

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./model/auth";
import { getProviderForUser } from "./model/providers";
import { requireOwnProvider, validateService } from "./model/services";
import { questionValidator } from "./model/bookingQuestions";
import { locationModeValidator } from "./model/serviceLocation";
import { requireActiveCategory } from "./model/categories";
import { requireSupportedSuburb } from "./model/locations";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const priceType = v.union(v.literal("fixed"), v.literal("hourly"), v.literal("quote"));
const venueArg = v.object({ name: v.optional(v.string()), address: v.optional(v.string()), suburb: v.optional(v.string()), notes: v.optional(v.string()) });
const fields = {
  name: v.string(), description: v.string(), priceType, priceCents: v.optional(v.number()), durationMinutes: v.number(),
  categorySlug: v.optional(v.string()), locationMode: v.optional(locationModeValidator), venue: v.optional(venueArg),
  onlineNote: v.optional(v.string()), meetingLink: v.optional(v.string()),
  questions: v.optional(v.array(questionValidator)),
};

/** A service is public without its private meeting link. Only the owner's own list carries it. */
const publicService = ({ meetingLink: _link, ...rest }: Doc<"services">) => rest;

/** Checks the parts that need the database, then lists the provider under the service's category so customers find them there. */
async function checkAndLink(ctx: MutationCtx, provider: Doc<"providers">, next: ReturnType<typeof validateService>) {
  if (next.categorySlug) {
    await requireActiveCategory(ctx, next.categorySlug);
    const has = new Set([provider.category, ...(provider.categorySlugs ?? [])]);
    if (!has.has(next.categorySlug)) await ctx.db.patch(provider._id, { categorySlugs: [...new Set([provider.category, ...(provider.categorySlugs ?? []), next.categorySlug])].slice(0, 20) });
  }
  if (next.venue) await requireSupportedSuburb(ctx, next.venue.suburb, (s) => `We don't operate in ${s} yet`);
}

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
    return rows.filter((s) => s.enabled && !s.archived).map(publicService);
  },
});

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const provider = await requireOwnProvider(ctx);
    const next = validateService(args);
    await checkAndLink(ctx, provider, next);
    return await ctx.db.insert("services", { ...next, providerId: provider._id, enabled: true, archived: false });
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
    const provider = await requireOwnProvider(ctx);
    const next = validateService(rest);
    await checkAndLink(ctx, provider, next);
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

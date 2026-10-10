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
  categoryRequestId: v.optional(v.string()), // "my category isn't listed": makes this a draft until that request is decided
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

/** One of the provider's own category requests that is still open. Anyone else's looks like it does not exist. */
async function openRequest(ctx: MutationCtx, provider: Doc<"providers">, id: string) {
  const requestId = ctx.db.normalizeId("categoryRequests", id);
  const request = requestId ? await ctx.db.get(requestId) : null;
  if (!request || request.providerId !== provider._id) throw new ConvexError("Category request not found");
  if (request.status !== "pending" && request.status !== "more_info") throw new ConvexError("That request has been decided. Pick the category from the list.");
  return request;
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
  handler: async (ctx, { categoryRequestId, ...args }) => {
    const provider = await requireOwnProvider(ctx);
    const next = validateService(args);
    if (categoryRequestId && next.categorySlug) throw new ConvexError("Pick a category or wait for your request, not both");
    const request = categoryRequestId ? await openRequest(ctx, provider, categoryRequestId) : undefined;
    await checkAndLink(ctx, provider, next);
    // Waiting on a category means a draft: it cannot be turned on until the request is decided and the service has a category.
    return await ctx.db.insert("services", { ...next, providerId: provider._id, enabled: !request, archived: false, ...(request ? { categoryRequestId: request._id } : {}) });
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
  handler: async (ctx, { id, categoryRequestId, ...rest }) => {
    const service = await ownService(ctx, id);
    const provider = await requireOwnProvider(ctx);
    const next = validateService(rest);
    if (categoryRequestId && next.categorySlug) throw new ConvexError("Pick a category or wait for your request, not both");
    // A newly chosen request links; a newly chosen category unlinks; otherwise an existing link stays until the request is decided.
    const request = categoryRequestId ? await openRequest(ctx, provider, categoryRequestId) : undefined;
    const keep = !request && !next.categorySlug ? service.categoryRequestId : request?._id;
    await checkAndLink(ctx, provider, next);
    await ctx.db.replace(service._id, {
      ...next, providerId: service.providerId, archived: false,
      // Linking to a request turns the service off; it was a draft already if it was linked before.
      enabled: request && request._id !== service.categoryRequestId ? false : service.enabled,
      ...(keep ? { categoryRequestId: keep } : {}),
    });
  },
});

export const setEnabled = mutation({
  args: { id: v.string(), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    const service = await ownService(ctx, id);
    // A draft waiting on a category request cannot go live until it has a category. Approving a request never does this for the provider.
    if (enabled && service.categoryRequestId && !service.categorySlug) {
      const request = await ctx.db.get(service.categoryRequestId);
      throw new ConvexError(request?.status === "rejected"
        ? "Your category request was declined. Choose a category for this service first."
        : "This service is waiting on your category request. You can turn it on once it is approved.");
    }
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

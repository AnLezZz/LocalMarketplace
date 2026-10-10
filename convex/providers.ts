import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getUser, requireUser } from "./model/auth";
import { getProviderForUser, providerStatus, validateProfile } from "./model/providers";
import { loadCategoryRows, providerSlugs, resolveProviderCategories, slugWithDescendants } from "./model/categories";
import { requireSupportedSuburb } from "./model/locations";
import { hasPlaces, isClosed, linkBase, MAX_AREAS, syncProviderAreas } from "./model/coverage";
import { checkImage, MAX_GALLERY, withPhotoUrl } from "./model/photos";

export const list = query({
  args: { category: v.optional(v.string()), suburb: v.optional(v.string()), q: v.optional(v.string()), placeId: v.optional(v.id("places")) },
  handler: async (ctx, { category, suburb, q, placeId }) => {
    // By place: providers who serve it, a wider area around it, or (for a region or council) something inside it. Indexed, not a scan.
    let all: Doc<"providers">[];
    if (placeId) {
      const place = await ctx.db.get(placeId);
      if (!place) return [];
      const ids = new Set<string>();
      for (const [pid, mode] of [[placeId, "serves"], [placeId, "within"], ...[...place.regionIds, ...place.taIds, ...(place.subdivisionIds ?? [])].map((a) => [a, "serves"] as const)] as const) {
        for (const r of await ctx.db.query("providerAreas").withIndex("by_place", (i) => i.eq("placeId", pid).eq("mode", mode)).take(500)) ids.add(r.providerId);
      }
      all = (await Promise.all([...ids].map((id) => ctx.db.get(id as Id<"providers">)))).flatMap((p) => (p?.approved ? [p] : []));
    } else {
      all = await ctx.db.query("providers").withIndex("by_approved", (i) => i.eq("approved", true)).collect();
    }
    const s = suburb?.toLowerCase(), k = q?.toLowerCase();
    // A category matches the providers listed under it or anything below it (Hair finds a Women's Haircut specialist).
    const wanted = category ? slugWithDescendants(await loadCategoryRows(ctx), category) : null;
    const found = all.filter((p) =>
      (!wanted || [...providerSlugs(p)].some((c) => wanted.has(c))) &&
      (!s || p.suburb.toLowerCase().includes(s)) &&
      (!k || p.name.toLowerCase().includes(k) || p.bio.toLowerCase().includes(k)));
    return await Promise.all(found.map((p) => withPhotoUrl(ctx, p)));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const pid = ctx.db.normalizeId("providers", id);
    const p = pid && (await ctx.db.get(pid));
    return p && p.approved ? await withPhotoUrl(ctx, p) : null;
  },
});

/** The signed-in user's own provider profile, with its review status. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const p = await getProviderForUser(ctx, user._id);
    return p ? { ...(await withPhotoUrl(ctx, p)), status: providerStatus(p) } : null;
  },
});

/** Apply to become a provider, or fix a pending/rejected application. Approved profiles are locked. */
export const submitProfile = mutation({
  args: {
    name: v.string(), bio: v.string(), category: v.string(), suburb: v.string(),
    rateCents: v.number(), rateBasis: v.union(v.literal("hourly"), v.literal("fixed")),
    more: v.optional(v.array(v.string())), // other categories, subcategories or services they offer
  },
  handler: async (ctx, { more, ...args }) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") throw new ConvexError("Admins cannot be providers");
    const fields = validateProfile(args);
    const existingForCats = await getProviderForUser(ctx, user._id);
    const categorySlugs = await resolveProviderCategories(ctx, fields.category, more, existingForCats ?? undefined);
    await requireSupportedSuburb(ctx, fields.suburb, (s) => `We don't operate in ${s} yet. Pick a suburb from the list.`);
    const existing = await getProviderForUser(ctx, user._id);
    // A suspended provider must not be able to resubmit and come back as "pending".
    if (existing?.suspendedAt !== undefined) throw new ConvexError("This listing is suspended. Contact support.");
    if (existing?.approved) throw new ConvexError("Approved profiles can't be edited yet. Contact support.");
    if (existing) {
      // Strictly increasing, so two submits in the same millisecond still get distinct stamps.
      const submittedAt = Math.max(Date.now(), (existing.submittedAt ?? 0) + 1);
      await ctx.db.patch(existing._id, { ...fields, categorySlugs, submittedAt, reviewedAt: undefined, rejectionReason: undefined });
      if (await hasPlaces(ctx)) await linkBase(ctx, existing, fields.suburb);
      return existing._id;
    }
    const id = await ctx.db.insert("providers", {
      ...fields, categorySlugs, userId: user._id, ratingAvg: 0, reviewCount: 0, approved: false, submittedAt: Date.now(),
    });
    await ctx.db.patch(user._id, { role: "provider" });
    const created = await ctx.db.get(id);
    if (created && (await hasPlaces(ctx))) await linkBase(ctx, created, fields.suburb);
    return id;
  },
});

/** The suburbs the owner travels to, besides their own. An empty list means anywhere. */
export const setServiceAreas = mutation({
  args: { suburbs: v.array(v.string()) },
  handler: async (ctx, { suburbs }) => {
    const user = await requireUser(ctx);
    const provider = await getProviderForUser(ctx, user._id);
    if (!provider) throw new ConvexError("Create your provider profile first");
    const clean = [...new Set(suburbs.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))];
    if (clean.length > 30) throw new ConvexError("List at most 30 suburbs");
    if (clean.some((s) => s.length > 60)) throw new ConvexError("A suburb name is too long");
    for (const s of clean) await requireSupportedSuburb(ctx, s, (x) => `${x} isn't a suburb we operate in`);
    await ctx.db.patch(provider._id, { serviceSuburbs: clean });
  },
});

// ---------- editing and photos ----------

async function ownProvider(ctx: Parameters<typeof requireUser>[0]) {
  const user = await requireUser(ctx);
  const provider = await getProviderForUser(ctx, user._id);
  if (!provider) throw new ConvexError("Create your provider profile first");
  if (provider.suspendedAt !== undefined) throw new ConvexError("This listing is suspended. Contact support.");
  return provider;
}

/** Approved providers edit their own profile directly. Applications still go through submitProfile. */
export const updateProfile = mutation({
  args: {
    name: v.string(), bio: v.string(), category: v.string(), suburb: v.string(),
    rateCents: v.number(), rateBasis: v.union(v.literal("hourly"), v.literal("fixed")),
    more: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { more, ...args }) => {
    const provider = await ownProvider(ctx);
    if (!provider.approved) throw new ConvexError("Your application is still being reviewed. Update it from the application form.");
    const fields = validateProfile(args);
    // An unchanged category or suburb stays valid even if it was disabled since; only a change is checked.
    // Categories the provider already has stay valid even if disabled since; only additions are checked.
    const categorySlugs = await resolveProviderCategories(ctx, fields.category, more ?? provider.categorySlugs, provider);
    if (fields.suburb.toLowerCase() !== provider.suburb.toLowerCase()) await requireSupportedSuburb(ctx, fields.suburb, (s) => `We don't operate in ${s} yet. Pick a suburb from the list.`);
    await ctx.db.patch(provider._id, { ...fields, categorySlugs });
    if (fields.suburb.toLowerCase() !== provider.suburb.toLowerCase() && (await hasPlaces(ctx))) await linkBase(ctx, provider, fields.suburb);
  },
});

/** A one-time URL the browser uploads a file to. The file is only used once setPhoto/addGalleryPhoto accepts it. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await ownProvider(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setPhoto = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const provider = await ownProvider(ctx);
    const checked = await checkImage(ctx, storageId);
    if (!checked.ok) return checked;
    const old = provider.photoStorageId;
    await ctx.db.patch(provider._id, { photoStorageId: storageId });
    if (old && old !== storageId) await ctx.storage.delete(old);
    return { ok: true as const };
  },
});

export const removePhoto = mutation({
  args: {},
  handler: async (ctx) => {
    const provider = await ownProvider(ctx);
    if (provider.photoStorageId) { await ctx.storage.delete(provider.photoStorageId); await ctx.db.patch(provider._id, { photoStorageId: undefined }); }
  },
});

export const addGalleryPhoto = mutation({
  args: { storageId: v.id("_storage"), caption: v.optional(v.string()) },
  handler: async (ctx, { storageId, caption }) => {
    const provider = await ownProvider(ctx);
    const count = (await ctx.db.query("providerPhotos").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).take(MAX_GALLERY + 1)).length;
    if (count >= MAX_GALLERY) { await ctx.storage.delete(storageId); return { ok: false as const, reason: `You can have up to ${MAX_GALLERY} gallery photos. Remove one first.` }; }
    const checked = await checkImage(ctx, storageId);
    if (!checked.ok) return checked;
    const note = caption?.trim().slice(0, 100);
    await ctx.db.insert("providerPhotos", { providerId: provider._id, storageId, ...(note ? { caption: note } : {}) });
    return { ok: true as const };
  },
});

export const removeGalleryPhoto = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const provider = await ownProvider(ctx);
    const pid = ctx.db.normalizeId("providerPhotos", id);
    const row = pid ? await ctx.db.get(pid) : null;
    if (!row || row.providerId !== provider._id) throw new ConvexError("Photo not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  },
});

async function galleryOf(ctx: Parameters<typeof getUser>[0], providerId: Doc<"providers">["_id"]) {
  const rows = await ctx.db.query("providerPhotos").withIndex("by_provider", (q) => q.eq("providerId", providerId)).take(MAX_GALLERY);
  const out = [];
  for (const r of rows) { const url = await ctx.storage.getUrl(r.storageId); if (url) out.push({ _id: r._id, url, caption: r.caption }); }
  return out;
}

/** Work photos on an approved provider's public profile. */
export const gallery = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, { providerId }) => {
    const provider = await ctx.db.get(providerId);
    return provider?.approved ? await galleryOf(ctx, providerId) : [];
  },
});

/** The owner's own gallery, available before approval so they can prepare it. */
export const galleryMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    const provider = user && (await getProviderForUser(ctx, user._id));
    return provider ? await galleryOf(ctx, provider._id) : [];
  },
});

/** Adds a place (suburb, council area or region) the owner serves. Independent of where they are based. */
export const addServiceArea = mutation({
  args: { placeId: v.id("places") },
  handler: async (ctx, { placeId }) => {
    const provider = await ownProvider(ctx);
    const place = await ctx.db.get(placeId);
    if (!place || !place.selectable || !place.active) throw new ConvexError("That place isn't available");
    if (await isClosed(ctx, place)) throw new ConvexError(`Localo hasn't launched in ${place.name} yet`);
    const areas = provider.serviceAreaIds ?? [];
    if (areas.includes(placeId)) return;
    if (areas.length >= MAX_AREAS) throw new ConvexError(`You can serve at most ${MAX_AREAS} areas. Pick a wider one, such as a region.`);
    await ctx.db.patch(provider._id, { serviceAreaIds: [...areas, placeId] });
    await syncProviderAreas(ctx, provider._id);
  },
});

export const removeServiceArea = mutation({
  args: { placeId: v.id("places") },
  handler: async (ctx, { placeId }) => {
    const provider = await ownProvider(ctx);
    await ctx.db.patch(provider._id, { serviceAreaIds: (provider.serviceAreaIds ?? []).filter((id) => id !== placeId) });
    await syncProviderAreas(ctx, provider._id);
  },
});

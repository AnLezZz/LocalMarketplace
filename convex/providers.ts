import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getUser, requireUser } from "./model/auth";
import { getProviderForUser, providerStatus, validateProfile } from "./model/providers";
import { requireActiveCategory } from "./model/categories";
import { requireSupportedSuburb } from "./model/locations";
import { checkImage, MAX_GALLERY, withPhotoUrl } from "./model/photos";

export const list = query({
  args: { category: v.optional(v.string()), suburb: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { category, suburb, q }) => {
    const all = await ctx.db.query("providers").withIndex("by_approved", (i) => i.eq("approved", true)).collect();
    const s = suburb?.toLowerCase(), k = q?.toLowerCase();
    const found = all.filter((p) =>
      (!category || p.category === category) &&
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
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") throw new ConvexError("Admins cannot be providers");
    const fields = validateProfile(args);
    await requireActiveCategory(ctx, fields.category);
    await requireSupportedSuburb(ctx, fields.suburb, (s) => `We don't operate in ${s} yet. Pick a suburb from the list.`);
    const existing = await getProviderForUser(ctx, user._id);
    // A suspended provider must not be able to resubmit and come back as "pending".
    if (existing?.suspendedAt !== undefined) throw new ConvexError("This listing is suspended. Contact support.");
    if (existing?.approved) throw new ConvexError("Approved profiles can't be edited yet. Contact support.");
    if (existing) {
      // Strictly increasing, so two submits in the same millisecond still get distinct stamps.
      const submittedAt = Math.max(Date.now(), (existing.submittedAt ?? 0) + 1);
      await ctx.db.patch(existing._id, { ...fields, submittedAt, reviewedAt: undefined, rejectionReason: undefined });
      return existing._id;
    }
    const id = await ctx.db.insert("providers", {
      ...fields, userId: user._id, ratingAvg: 0, reviewCount: 0, approved: false, submittedAt: Date.now(),
    });
    await ctx.db.patch(user._id, { role: "provider" });
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
  },
  handler: async (ctx, args) => {
    const provider = await ownProvider(ctx);
    if (!provider.approved) throw new ConvexError("Your application is still being reviewed. Update it from the application form.");
    const fields = validateProfile(args);
    // An unchanged category or suburb stays valid even if it was disabled since; only a change is checked.
    if (fields.category !== provider.category) await requireActiveCategory(ctx, fields.category);
    if (fields.suburb.toLowerCase() !== provider.suburb.toLowerCase()) await requireSupportedSuburb(ctx, fields.suburb, (s) => `We don't operate in ${s} yet. Pick a suburb from the list.`);
    await ctx.db.patch(provider._id, fields);
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

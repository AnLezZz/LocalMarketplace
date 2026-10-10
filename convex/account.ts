import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { checkImage } from "./model/photos";
import { norm } from "./model/jobDetails";

const MAX_ADDRESSES = 5;
const DEFAULT_PREFS = { updates: true, reminders: true, reviews: true };

/** Everything the account page shows. Null when signed out. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const rows = await ctx.db.query("savedAddresses").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_ADDRESSES);
    const photo = user.imageStorageId ? await ctx.storage.getUrl(user.imageStorageId) : (user.image ?? null);
    return {
      name: user.name ?? "", email: user.email ?? "", role: user.role, contactPhone: user.contactPhone ?? "", photo,
      emailPrefs: { ...DEFAULT_PREFS, ...user.emailPrefs },
      addresses: rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map((a) => ({ _id: a._id, label: a.label, address: a.address, suburb: a.suburb, accessNotes: a.accessNotes, isDefault: a.isDefault })),
    };
  },
});

const cleanPhone = (raw: string | undefined) => {
  const p = (raw ?? "").replace(/[\s()-]/g, "");
  if (p && !/^\+?\d{7,15}$/.test(p)) throw new ConvexError("Enter a valid phone number, or leave it blank");
  return p;
};

export const updateProfile = mutation({
  args: { name: v.string(), contactPhone: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const name = norm(a.name);
    if (!name) throw new ConvexError("Enter your name");
    if (name.length > 80) throw new ConvexError("That name is too long");
    await ctx.db.patch(user._id, { name, contactPhone: cleanPhone(a.contactPhone) || undefined });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setPhoto = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    const checked = await checkImage(ctx, storageId);
    if (!checked.ok) return checked;
    const old = user.imageStorageId;
    await ctx.db.patch(user._id, { imageStorageId: storageId });
    if (old && old !== storageId) await ctx.storage.delete(old);
    return { ok: true as const };
  },
});

export const removePhoto = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.imageStorageId) { await ctx.storage.delete(user.imageStorageId); await ctx.db.patch(user._id, { imageStorageId: undefined }); }
  },
});

export const addAddress = mutation({
  args: { label: v.string(), address: v.string(), suburb: v.string(), accessNotes: v.optional(v.string()), makeDefault: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const label = norm(a.label), address = norm(a.address), suburb = norm(a.suburb), notes = (a.accessNotes ?? "").trim();
    if (!label) throw new ConvexError("Give the address a name, like Home or Work");
    if (address.length < 5) throw new ConvexError("Enter the street address");
    if (!suburb) throw new ConvexError("Enter the suburb");
    if (label.length > 30 || address.length > 200 || suburb.length > 60 || notes.length > 500) throw new ConvexError("One of the fields is too long");
    const existing = await ctx.db.query("savedAddresses").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_ADDRESSES + 1);
    if (existing.length >= MAX_ADDRESSES) throw new ConvexError(`You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    // The first address is the default; a later one only if asked.
    const isDefault = existing.length === 0 || !!a.makeDefault;
    if (isDefault) for (const e of existing) if (e.isDefault) await ctx.db.patch(e._id, { isDefault: false });
    return await ctx.db.insert("savedAddresses", { userId: user._id, label, address, suburb, isDefault, ...(notes ? { accessNotes: notes } : {}) });
  },
});

async function ownAddress(ctx: Parameters<typeof requireUser>[0], id: string) {
  const user = await requireUser(ctx);
  const aid = ctx.db.normalizeId("savedAddresses", id);
  const row = aid ? await ctx.db.get(aid) : null;
  if (!row || row.userId !== user._id) throw new ConvexError("Address not found");
  return { user, row };
}

export const removeAddress = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const { user, row } = await ownAddress(ctx, id);
    await ctx.db.delete(row._id);
    if (row.isDefault) {
      const next = (await ctx.db.query("savedAddresses").withIndex("by_user", (q) => q.eq("userId", user._id)).take(1))[0];
      if (next) await ctx.db.patch(next._id, { isDefault: true });
    }
  },
});

export const setDefaultAddress = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const { user, row } = await ownAddress(ctx, id);
    for (const e of await ctx.db.query("savedAddresses").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_ADDRESSES)) {
      if (e.isDefault && e._id !== row._id) await ctx.db.patch(e._id, { isDefault: false });
    }
    await ctx.db.patch(row._id, { isDefault: true });
  },
});

export const setEmailPrefs = mutation({
  args: { updates: v.boolean(), reminders: v.boolean(), reviews: v.boolean() },
  handler: async (ctx, prefs) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { emailPrefs: prefs });
  },
});

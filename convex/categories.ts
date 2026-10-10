import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./model/auth";
import { audit } from "./model/audit";
import { DEFAULT_CATEGORIES, MAX_CATEGORIES, slugify, validateCategoryInput } from "./model/categories";

/** Every category in display order, for everyone. Falls back to the built-ins until an admin saves the list. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("categories").take(MAX_CATEGORIES + 1);
    if (rows.length === 0) return { saved: false, categories: DEFAULT_CATEGORIES.map((c, i) => ({ _id: null, ...c, order: i, enabled: true })) };
    return { saved: true, categories: rows.sort((a, b) => a.order - b.order).map((c) => ({ _id: c._id as string | null, slug: c.slug, label: c.label, icon: c.icon, hue: c.hue, order: c.order, enabled: c.enabled })) };
  },
});

/** Saves the built-in categories so they can be edited. Safe to run twice. */
export const initDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, "admin");
    if ((await ctx.db.query("categories").first()) !== null) return;
    for (const [order, c] of DEFAULT_CATEGORIES.entries()) await ctx.db.insert("categories", { ...c, order, enabled: true });
    await audit(ctx, admin._id, "category.init", "category", "defaults");
  },
});

async function all(ctx: Parameters<typeof requireRole>[0]) {
  const rows = await ctx.db.query("categories").take(MAX_CATEGORIES + 1);
  if (rows.length === 0) throw new ConvexError("Save the default categories first");
  return rows.sort((a, b) => a.order - b.order);
}

export const create = mutation({
  args: { label: v.string(), icon: v.string(), hue: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    if (rows.length >= MAX_CATEGORIES) throw new ConvexError(`You can have up to ${MAX_CATEGORIES} categories`);
    const fields = validateCategoryInput(a);
    const slug = slugify(fields.label);
    if (!slug) throw new ConvexError("Use letters or numbers in the name");
    if (rows.some((r) => r.slug === slug)) throw new ConvexError("There is already a category with that name");
    const id = await ctx.db.insert("categories", { slug, ...fields, order: Math.max(...rows.map((r) => r.order)) + 1, enabled: true });
    await audit(ctx, admin._id, "category.create", "category", id, fields.label);
    return id;
  },
});

/** Changes the label, icon and colour. The slug stays, so providers keep their category. */
export const update = mutation({
  args: { id: v.id("categories"), label: v.string(), icon: v.string(), hue: v.string() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const c = await ctx.db.get(a.id);
    if (!c) throw new ConvexError("Category not found");
    await ctx.db.patch(c._id, validateCategoryInput(a));
    await audit(ctx, admin._id, "category.update", "category", c._id, `${c.label} -> ${a.label.trim()}`);
  },
});

/** Disabled categories leave the browse list and the pickers; existing listings stay visible. */
export const setEnabled = mutation({
  args: { id: v.id("categories"), enabled: v.boolean() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    const c = rows.find((r) => r._id === a.id);
    if (!c) throw new ConvexError("Category not found");
    if (!a.enabled && rows.filter((r) => r.enabled && r._id !== c._id).length === 0) throw new ConvexError("At least one category has to stay enabled");
    await ctx.db.patch(c._id, { enabled: a.enabled });
    await audit(ctx, admin._id, a.enabled ? "category.enable" : "category.disable", "category", c._id, c.label);
  },
});

/** Swaps a category with its neighbour in display order. */
export const move = mutation({
  args: { id: v.id("categories"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    const i = rows.findIndex((r) => r._id === a.id);
    if (i === -1) throw new ConvexError("Category not found");
    const j = a.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return;
    // Orders are renumbered 0..n so they never collide.
    const next = rows.slice(); [next[i], next[j]] = [next[j], next[i]];
    for (const [order, r] of next.entries()) if (r.order !== order) await ctx.db.patch(r._id, { order });
    await audit(ctx, admin._id, "category.move", "category", rows[i]._id, `${rows[i].label} ${a.direction}`);
  },
});

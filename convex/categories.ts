import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireRole } from "./model/auth";
import { audit } from "./model/audit";
import { checkImage } from "./model/photos";
import { activeRows, DEFAULT_CATEGORIES, depthOf, insertCategory, loadCategoryRows, MAX_CATEGORIES, MAX_DEPTH, slugify, STARTER, validateCategoryInput, type StarterNode } from "./model/categories";

/** Rows in tree order (a parent, then its children), siblings by their order. */
function inTreeOrder(rows: Doc<"categories">[]): Doc<"categories">[] {
  const ids = new Set(rows.map((r) => r._id));
  const kids = new Map<string | undefined, Doc<"categories">[]>();
  for (const r of rows) {
    const key = r.parentId && ids.has(r.parentId) ? r.parentId : undefined; // an orphan counts as a main category
    kids.set(key, [...(kids.get(key) ?? []), r]);
  }
  const out: Doc<"categories">[] = [];
  const walk = (key: string | undefined, hops: number) => {
    for (const r of (kids.get(key) ?? []).sort((a, b) => a.order - b.order)) { out.push(r); if (hops < MAX_DEPTH) walk(r._id, hops + 1); }
  };
  walk(undefined, 0);
  return out;
}

async function shape(ctx: QueryCtx, rows: Doc<"categories">[]) {
  const ordered = inTreeOrder(rows);
  const active = new Set(activeRows(rows).map((r) => r._id));
  const slugOf = new Map(rows.map((r) => [r._id, r.slug]));
  return await Promise.all(ordered.map(async (c) => ({
    _id: c._id as string | null, slug: c.slug, label: c.label, icon: c.icon, hue: c.hue, order: c.order, enabled: c.enabled, active: active.has(c._id),
    parentSlug: (c.parentId && slugOf.get(c.parentId)) || null, depth: depthOf(rows, c),
    featured: c.featured ?? !c.parentId, // saved before featuring existed: main categories were always on the homepage
    imageUrl: c.imageStorageId ? await ctx.storage.getUrl(c.imageStorageId) : null,
  })));
}

const builtIn = () => DEFAULT_CATEGORIES.map((c, i) => ({ _id: null as string | null, ...c, order: i, enabled: true, active: true, parentSlug: null as string | null, depth: 0, featured: true, imageUrl: null as string | null }));

/** Every category in tree order, for everyone. Falls back to the built-ins until an admin saves the list. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await loadCategoryRows(ctx);
    if (rows.length === 0) return { saved: false, categories: builtIn() };
    return { saved: true, categories: await shape(ctx, rows) };
  },
});

/** What the homepage shows: featured, usable categories. Reactive, so an admin's change appears without a reload. */
export const featured = query({
  args: {},
  handler: async (ctx) => {
    const rows = await loadCategoryRows(ctx);
    const all = rows.length === 0 ? builtIn() : await shape(ctx, rows);
    return all.filter((c) => c.featured && c.active).sort((a, b) => a.depth - b.depth).map((c) => ({ slug: c.slug, label: c.label, icon: c.icon, hue: c.hue, imageUrl: c.imageUrl }));
  },
});

/** Saves the built-in categories so they can be edited. Safe to run twice. */
export const initDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, "admin");
    if ((await ctx.db.query("categories").first()) !== null) return;
    for (const [order, c] of DEFAULT_CATEGORIES.entries()) await ctx.db.insert("categories", { ...c, order, enabled: true, featured: true });
    await audit(ctx, admin._id, "category.init", "category", "defaults");
  },
});

async function all(ctx: Parameters<typeof requireRole>[0]) {
  const rows = await loadCategoryRows(ctx);
  if (rows.length === 0) throw new ConvexError("Save the default categories first");
  return rows;
}

const siblings = (rows: Doc<"categories">[], parentId: Id<"categories"> | undefined) => rows.filter((r) => r.parentId === parentId).sort((a, b) => a.order - b.order);

/** Creates a main category, or a subcategory/service under `parentId`. A child's key is prefixed with its parent's, so "Cleaning" can exist under Home Services and as a main category. */
export const create = mutation({
  args: { label: v.string(), icon: v.string(), hue: v.string(), parentId: v.optional(v.id("categories")), featured: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    const made = await insertCategory(ctx, rows, a);
    const parent = a.parentId ? rows.find((r) => r._id === a.parentId) : undefined;
    await audit(ctx, admin._id, "category.create", "category", made.id, parent ? `${parent.label} > ${made.label}` : made.label);
    return made.id;
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

export const setFeatured = mutation({
  args: { id: v.id("categories"), featured: v.boolean() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const c = await ctx.db.get(a.id);
    if (!c) throw new ConvexError("Category not found");
    await ctx.db.patch(c._id, { featured: a.featured });
    await audit(ctx, admin._id, a.featured ? "category.feature" : "category.unfeature", "category", c._id, c.label);
  },
});

/** Disabled categories (and everything under them) leave browsing and the pickers; existing listings stay visible. */
export const setEnabled = mutation({
  args: { id: v.id("categories"), enabled: v.boolean() },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    const c = rows.find((r) => r._id === a.id);
    if (!c) throw new ConvexError("Category not found");
    const after = rows.map((r) => (r._id === c._id ? { ...r, enabled: a.enabled } : r));
    if (!a.enabled && activeRows(after).filter((r) => depthOf(after, r) === 0).length === 0) throw new ConvexError("At least one main category has to stay enabled");
    await ctx.db.patch(c._id, { enabled: a.enabled });
    await audit(ctx, admin._id, a.enabled ? "category.enable" : "category.disable", "category", c._id, c.label);
  },
});

/** Swaps a category with its neighbour among the same parent's children. */
export const move = mutation({
  args: { id: v.id("categories"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    const me = rows.find((r) => r._id === a.id);
    if (!me) throw new ConvexError("Category not found");
    const sibs = siblings(rows, me.parentId);
    const i = sibs.findIndex((r) => r._id === me._id);
    const j = a.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    // Orders are renumbered 0..n so they never collide.
    const next = sibs.slice(); [next[i], next[j]] = [next[j], next[i]];
    for (const [order, r] of next.entries()) if (r.order !== order) await ctx.db.patch(r._id, { order });
    await audit(ctx, admin._id, "category.move", "category", me._id, `${me.label} ${a.direction}`);
  },
});

/** Deleting is allowed only when nothing depends on it: no children, and no provider lists it. Otherwise disable it. */
export const remove = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await all(ctx);
    const c = rows.find((r) => r._id === a.id);
    if (!c) throw new ConvexError("Category not found");
    if (rows.some((r) => r.parentId === c._id)) throw new ConvexError("Delete or move what is inside it first");
    if (!c.parentId && rows.filter((r) => !r.parentId).length <= 1) throw new ConvexError("At least one main category has to stay");
    const providers = await ctx.db.query("providers").take(5001);
    if (providers.length > 5000) throw new ConvexError("Too many providers to check safely. Disable it instead.");
    const using = providers.filter((p) => p.category === c.slug || (p.categorySlugs ?? []).includes(c.slug)).length;
    if (using > 0) throw new ConvexError(`${using} ${using === 1 ? "provider uses" : "providers use"} it. Disable it instead.`);
    if (c.imageStorageId) await ctx.storage.delete(c.imageStorageId);
    await ctx.db.delete(c._id);
    await audit(ctx, admin._id, "category.delete", "category", c._id, c.label);
  },
});

// ---------- images ----------

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.storage.generateUploadUrl();
  },
});

export const setImage = mutation({
  args: { id: v.id("categories"), storageId: v.id("_storage") },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const c = await ctx.db.get(a.id);
    if (!c) { await ctx.storage.delete(a.storageId); throw new ConvexError("Category not found"); }
    const checked = await checkImage(ctx, a.storageId);
    if (!checked.ok) return checked;
    const old = c.imageStorageId;
    await ctx.db.patch(c._id, { imageStorageId: a.storageId });
    if (old && old !== a.storageId) await ctx.storage.delete(old);
    await audit(ctx, admin._id, "category.image", "category", c._id, c.label);
    return { ok: true as const };
  },
});

export const removeImage = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const c = await ctx.db.get(a.id);
    if (!c?.imageStorageId) return;
    await ctx.storage.delete(c.imageStorageId);
    await ctx.db.patch(c._id, { imageStorageId: undefined });
    await audit(ctx, admin._id, "category.image.remove", "category", c._id, c.label);
  },
});

/**
 * Adds the starter categories (model/categories.ts STARTER) as ordinary editable data: the six built-ins with their types, plus
 * Plumbing & Electrical, Beauty & Wellness and Child & Family. Anything already there (matched by key) is left exactly as it is,
 * so it is safe to run twice and never touches what an admin has renamed, disabled or re-iconed.
 */
export const seedStarter = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireRole(ctx, "admin");
    const rows = await loadCategoryRows(ctx);
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    let added = 0;
    const walk = async (nodes: StarterNode[], parent: Doc<"categories"> | null) => {
      for (const node of nodes) {
        const slug = slugify(parent ? `${parent.slug} ${node.label}` : node.label);
        let row = bySlug.get(slug);
        if (!row) {
          if (bySlug.size >= MAX_CATEGORIES) throw new ConvexError(`You can have up to ${MAX_CATEGORIES} categories`);
          const siblingOrders = [...bySlug.values()].filter((r) => r.parentId === parent?._id).map((r) => r.order);
          const id = await ctx.db.insert("categories", {
            slug, label: node.label, icon: node.icon, hue: node.hue, order: Math.max(-1, ...siblingOrders) + 1, enabled: true,
            featured: !parent, ...(parent ? { parentId: parent._id } : {}),
          });
          row = (await ctx.db.get(id))!;
          bySlug.set(slug, row);
          added++;
        }
        if (node.children) await walk(node.children, row);
      }
    };
    await walk(STARTER, null);
    if (added > 0) await audit(ctx, admin._id, "category.starter", "category", "starter", `${added} added`);
    return added;
  },
});

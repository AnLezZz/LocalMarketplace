import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The built-in categories. They apply until an admin saves the list to the database (categories.initDefaults). */
export const DEFAULT_CATEGORIES = [
  { slug: "cleaning", label: "Cleaning", icon: "cleaning", hue: "cleaning" },
  { slug: "gardening", label: "Gardening", icon: "gardening", hue: "gardening" },
  { slug: "handyman", label: "Handyman", icon: "handyman", hue: "handyman" },
  { slug: "pet care", label: "Pet care", icon: "petCare", hue: "petcare" },
  { slug: "car detailing", label: "Car detailing", icon: "car", hue: "car" },
  { slug: "moving help", label: "Moving help", icon: "moving", hue: "moving" },
] as const;

// What the app can actually draw. Keep in sync with lib/categories.ts (the app cannot import from convex/).
export const CATEGORY_ICONS = ["cleaning", "gardening", "handyman", "petCare", "car", "moving", "home", "leaf", "tag", "briefcase", "star", "heart"] as const;
export const CATEGORY_HUES = ["cleaning", "gardening", "handyman", "petcare", "car", "moving", "neutral"] as const;
export const MAX_CATEGORIES = 300;
export const MAX_DEPTH = 3; // main category, subcategory, individual service
export const MAX_PROVIDER_CATEGORIES = 20;

/** Lowercase, ASCII-ish, single spaces: "Roof & Gutter Care" -> "roof gutter care". */
export function slugify(label: string): string {
  return label.toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function validateCategoryInput(input: { label: string; icon: string; hue: string }) {
  const label = input.label.trim().replace(/\s+/g, " ");
  if (!label) throw new ConvexError("Give the category a name");
  if (label.length > 40) throw new ConvexError("That name is too long");
  if (!(CATEGORY_ICONS as readonly string[]).includes(input.icon)) throw new ConvexError("Choose one of the available icons");
  if (!(CATEGORY_HUES as readonly string[]).includes(input.hue)) throw new ConvexError("Choose one of the available colours");
  return { label, icon: input.icon, hue: input.hue };
}

type Row = Doc<"categories">;

export async function loadCategoryRows(ctx: QueryCtx | MutationCtx): Promise<Row[]> {
  return await ctx.db.query("categories").take(MAX_CATEGORIES + 1);
}

/** Depth 0 = main category. Rows whose parent is missing count as main, so nothing disappears. */
export function depthOf(rows: Row[], row: Row): number {
  const byId = new Map(rows.map((r) => [r._id, r]));
  let d = 0;
  for (let p = row.parentId && byId.get(row.parentId); p && d < MAX_DEPTH; p = p.parentId && byId.get(p.parentId)) d++;
  return d;
}

/** A category is usable when it and everything above it is enabled. */
export function activeRows(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r._id, r]));
  const ok = (r: Row, hops = 0): boolean => r.enabled && (!r.parentId || hops > MAX_DEPTH || (byId.has(r.parentId) ? ok(byId.get(r.parentId)!, hops + 1) : true));
  return rows.filter((r) => ok(r));
}

/** The slug and every slug below it, so a search for "Hair" finds someone who only offers "Women's Haircut". */
export function slugWithDescendants(rows: Row[], slug: string): Set<string> {
  const out = new Set<string>([slug]);
  const root = rows.find((r) => r.slug === slug);
  if (!root) return out;
  const ids = new Set<string>([root._id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) if (r.parentId && ids.has(r.parentId) && !ids.has(r._id)) { ids.add(r._id); out.add(r.slug); grew = true; }
  }
  return out;
}

/** The slugs a provider is listed under: the primary category plus everything else they picked. */
export const providerSlugs = (p: { category: string; categorySlugs?: string[] }) => new Set([p.category, ...(p.categorySlugs ?? [])]);

/** Slugs customers and providers may choose now: usable rows, or the built-ins when nothing is saved yet. */
export async function activeCategorySlugs(ctx: QueryCtx | MutationCtx): Promise<string[]> {
  const rows = await loadCategoryRows(ctx);
  return rows.length === 0 ? DEFAULT_CATEGORIES.map((c) => c.slug) : activeRows(rows).map((r) => r.slug);
}

export async function requireActiveCategory(ctx: QueryCtx | MutationCtx, slug: string) {
  if (!(await activeCategorySlugs(ctx)).includes(slug)) throw new ConvexError("Unknown category");
}

/** The primary category plus extras, deduped and checked. Extras already on the provider stay valid even if disabled since. */
export async function resolveProviderCategories(ctx: QueryCtx | MutationCtx, primary: string, more: string[] | undefined, existing?: { category: string; categorySlugs?: string[] }) {
  const slugs = [...new Set([primary, ...(more ?? [])])];
  if (slugs.length > MAX_PROVIDER_CATEGORIES) throw new ConvexError(`Choose at most ${MAX_PROVIDER_CATEGORIES} categories`);
  const active = new Set(await activeCategorySlugs(ctx));
  const kept = existing ? providerSlugs(existing) : new Set<string>();
  for (const s of slugs) if (!active.has(s) && !kept.has(s)) throw new ConvexError("Unknown category");
  return slugs;
}

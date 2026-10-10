import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
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

/**
 * The starter taxonomy an admin can add in one click (categories.seedStarter). Each name appears once, so a provider never has to
 * choose between two "Plumbing"s. The six built-ins stay main categories (providers already use their keys); they gain types.
 * Shape: main { label, icon, hue, existing? (a built-in, already saved) } > types { label, icon, hue } > services (labels only).
 */
export type StarterNode = { label: string; icon: string; hue: string; children?: StarterNode[] };
export const STARTER: StarterNode[] = [
  { label: "Cleaning", icon: "cleaning", hue: "cleaning", children: [
    { label: "House cleaning", icon: "home", hue: "cleaning" }, { label: "End-of-tenancy clean", icon: "sparkles", hue: "cleaning" },
    { label: "Window cleaning", icon: "window", hue: "cleaning" }, { label: "Carpet cleaning", icon: "cleaning", hue: "cleaning" } ] },
  { label: "Gardening", icon: "gardening", hue: "gardening", children: [
    { label: "Lawn mowing", icon: "leaf", hue: "gardening" }, { label: "Hedge trimming", icon: "tree", hue: "gardening" }, { label: "Garden tidy-up", icon: "gardening", hue: "gardening" } ] },
  { label: "Handyman", icon: "handyman", hue: "handyman", children: [
    { label: "General repairs", icon: "handyman", hue: "handyman" }, { label: "Furniture assembly", icon: "home", hue: "handyman" }, { label: "Painting", icon: "paint", hue: "handyman" } ] },
  { label: "Pet care", icon: "petCare", hue: "petcare", children: [
    { label: "Dog walking", icon: "petCare", hue: "petcare" }, { label: "Pet sitting", icon: "heart", hue: "petcare" }, { label: "Grooming", icon: "scissors", hue: "petcare" } ] },
  { label: "Car detailing", icon: "car", hue: "car", children: [
    { label: "Exterior wash", icon: "droplet", hue: "car" }, { label: "Interior clean", icon: "sparkles", hue: "car" }, { label: "Full detail", icon: "car", hue: "car" } ] },
  { label: "Moving help", icon: "moving", hue: "moving", children: [
    { label: "House moves", icon: "moving", hue: "moving" }, { label: "Furniture delivery", icon: "truck", hue: "moving" }, { label: "Rubbish removal", icon: "truck", hue: "moving" } ] },
  { label: "Plumbing & Electrical", icon: "bolt", hue: "car", children: [
    { label: "Plumbing", icon: "droplet", hue: "car", children: [
      { label: "Leaks and repairs", icon: "droplet", hue: "car" }, { label: "Drain unblocking", icon: "droplet", hue: "car" }, { label: "Hot water", icon: "droplet", hue: "car" } ] },
    { label: "Electrical", icon: "bolt", hue: "handyman", children: [
      { label: "Lighting and power points", icon: "bolt", hue: "handyman" }, { label: "Appliance installation", icon: "bolt", hue: "handyman" } ] } ] },
  { label: "Beauty & Wellness", icon: "spa", hue: "petcare", children: [
    { label: "Hair", icon: "scissors", hue: "petcare", children: [
      { label: "Women's Haircut", icon: "scissors", hue: "petcare" }, { label: "Men's Haircut", icon: "scissors", hue: "petcare" }, { label: "Hair Colouring", icon: "paint", hue: "petcare" } ] },
    { label: "Spa", icon: "spa", hue: "car", children: [
      { label: "Facial", icon: "sparkles", hue: "car" }, { label: "Massage", icon: "spa", hue: "car" }, { label: "Body Treatment", icon: "droplet", hue: "car" } ] } ] },
  { label: "Child & Family", icon: "smile", hue: "gardening", children: [
    { label: "Babysitting", icon: "smile", hue: "gardening" }, { label: "Tutoring", icon: "book", hue: "gardening" }, { label: "Nanny Services", icon: "heart", hue: "gardening" } ] },
];

// What the app can actually draw. Keep in sync with lib/categories.ts (the app cannot import from convex/).
export const CATEGORY_ICONS = ["cleaning", "gardening", "handyman", "petCare", "car", "moving", "home", "leaf", "tag", "briefcase", "star", "heart", "scissors", "spa", "smile", "book", "droplet", "bolt", "paint", "window", "tree", "truck", "sparkles"] as const;
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

/**
 * Adds a main category, or a subcategory/service under `parentId`, and returns its id. Every way of creating one goes through here
 * so the limits and the duplicate check are the same. A child's key is prefixed with its parent's, so "Cleaning" can exist under
 * Home Services and as a main category.
 */
export async function insertCategory(
  ctx: MutationCtx, rows: Row[],
  a: { label: string; icon: string; hue: string; parentId?: Id<"categories">; featured?: boolean },
): Promise<{ id: Id<"categories">; slug: string; label: string }> {
  if (rows.length >= MAX_CATEGORIES) throw new ConvexError(`You can have up to ${MAX_CATEGORIES} categories`);
  const fields = validateCategoryInput(a);
  const parent = a.parentId ? rows.find((r) => r._id === a.parentId) : undefined;
  if (a.parentId && !parent) throw new ConvexError("Parent category not found");
  if (parent && depthOf(rows, parent) >= MAX_DEPTH - 1) throw new ConvexError("Categories go three levels deep: category, subcategory, service");
  const slug = slugify(parent ? `${parent.slug} ${fields.label}` : fields.label);
  if (!slug) throw new ConvexError("Use letters or numbers in the name");
  if (rows.some((r) => r.slug === slug)) throw new ConvexError("There is already a category with that name here");
  const order = Math.max(-1, ...rows.filter((r) => r.parentId === parent?._id).map((r) => r.order)) + 1;
  const id = await ctx.db.insert("categories", { slug, ...fields, order, enabled: true, featured: a.featured ?? false, ...(parent ? { parentId: parent._id } : {}) });
  return { id, slug, label: fields.label };
}

/** Compact comparison form: lowercase letters and digits only, so "Window-Tinting", "window tinting" and "WINDOW  TINTING" match. */
export const squash = (label: string) => slugify(label).replace(/\s/g, "");

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

const words = (label: string) => slugify(label).split(" ").filter((w) => w.length > 2);

/**
 * Existing categories a proposed name could be mistaken for.
 *  - `exact`: same name or key once case, spacing and punctuation are ignored. A request for it is refused.
 *  - `similar`: one contains the other, they share most of their words, or they are a typo apart. An admin decides.
 * Rows are checked whether or not they are enabled, so a switched-off category is not quietly recreated.
 */
export function findDuplicates(rows: Row[], name: string): { exact: Row[]; similar: Row[] } {
  const want = squash(name);
  const wantWords = new Set(words(name));
  const exact: Row[] = [], similar: Row[] = [];
  for (const r of rows) {
    const label = squash(r.label), key = squash(r.slug);
    if (want && (label === want || key === want)) { exact.push(r); continue; }
    if (!want || !label) continue;
    const theirs = words(r.label);
    const shared = theirs.filter((w) => wantWords.has(w)).length;
    const overlap = wantWords.size > 0 && theirs.length > 0 && shared / Math.min(wantWords.size, theirs.length) >= 0.5;
    const contains = Math.min(want.length, label.length) >= 4 && (label.includes(want) || want.includes(label));
    const typo = Math.min(want.length, label.length) >= 5 && distance(want, label) <= (want.length >= 9 ? 2 : 1);
    if (overlap || contains || typo) similar.push(r);
  }
  return { exact, similar };
}

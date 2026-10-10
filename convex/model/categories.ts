import { ConvexError } from "convex/values";
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
export const MAX_CATEGORIES = 20;

/** Lowercase, ASCII-ish, single spaces: "Roof & Gutter Care" -> "roof gutter care". */
export function slugify(label: string): string {
  return label.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function validateCategoryInput(input: { label: string; icon: string; hue: string }) {
  const label = input.label.trim().replace(/\s+/g, " ");
  if (!label) throw new ConvexError("Give the category a name");
  if (label.length > 40) throw new ConvexError("That name is too long");
  if (!(CATEGORY_ICONS as readonly string[]).includes(input.icon)) throw new ConvexError("Choose one of the available icons");
  if (!(CATEGORY_HUES as readonly string[]).includes(input.hue)) throw new ConvexError("Choose one of the available colours");
  return { label, icon: input.icon, hue: input.hue };
}

/** Slugs customers and providers may choose now: the enabled rows, or the built-ins when nothing is saved yet. */
export async function activeCategorySlugs(ctx: QueryCtx | MutationCtx): Promise<string[]> {
  const rows = await ctx.db.query("categories").take(MAX_CATEGORIES + 1);
  return rows.length === 0 ? DEFAULT_CATEGORIES.map((c) => c.slug) : rows.filter((r) => r.enabled).map((r) => r.slug);
}

export async function requireActiveCategory(ctx: QueryCtx | MutationCtx, slug: string) {
  if (!(await activeCategorySlugs(ctx)).includes(slug)) throw new ConvexError("Unknown category");
}

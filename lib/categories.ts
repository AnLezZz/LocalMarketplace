import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "./convex";
import type { IconName } from "../components/Icon";
import { categoryMeta as builtIn } from "../components/categories";

export type CategoryRow = { _id: string | null; slug: string; label: string; icon: IconName; hue: string; order: number; enabled: boolean };

// What the admin may pick from: the icons the app draws and the colours it has tokens for.
// Keep in sync with convex/model/categories.ts (the app cannot import from convex/).
export const CATEGORY_ICONS = ["cleaning", "gardening", "handyman", "petCare", "car", "moving", "home", "leaf", "tag", "briefcase", "star", "heart"] as const;
export const CATEGORY_HUES = ["cleaning", "gardening", "handyman", "petcare", "car", "moving", "neutral"] as const;

/** All categories (admin-managed, or the built-ins until saved), loaded once per request. `enabled` are the ones to offer. */
export const loadCategories = cache(async () => {
  const r = (await fetchQuery(api.categories.list, {})) as { saved: boolean; categories: CategoryRow[] };
  return { saved: r.saved, all: r.categories, enabled: r.categories.filter((c) => c.enabled) };
});

/** Display details for a slug. Unknown slugs (an old listing) fall back to the built-in look. */
export function metaIn(rows: CategoryRow[], slug: string) {
  const c = rows.find((r) => r.slug === slug);
  return c ? { label: c.label, icon: c.icon, hue: c.hue } : builtIn(slug);
}

/** The launch city and the suburbs customers may use, loaded once per request. */
export const loadLocations = cache(async () => (await fetchQuery(api.locations.overview, {})) as { city: string; restricted: boolean; places: boolean; suburbs: string[] });

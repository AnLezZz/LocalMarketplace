import type { IconName } from "./Icon";
import { CATEGORIES } from "../lib/convex";

export type Category = (typeof CATEGORIES)[number];

/** Display metadata per category: label, drawn icon, and the CSS hue key used by tokens (--cat-<hue>-*). */
export const CATEGORY_META: Record<Category, { label: string; icon: IconName; hue: string }> = {
  cleaning: { label: "Cleaning", icon: "cleaning", hue: "cleaning" },
  gardening: { label: "Gardening", icon: "gardening", hue: "gardening" },
  handyman: { label: "Handyman", icon: "handyman", hue: "handyman" },
  "pet care": { label: "Pet care", icon: "petCare", hue: "petcare" },
  "car detailing": { label: "Car detailing", icon: "car", hue: "car" },
  "moving help": { label: "Moving help", icon: "moving", hue: "moving" },
};

export function categoryMeta(c: string) {
  return CATEGORY_META[c as Category] ?? { label: c.charAt(0).toUpperCase() + c.slice(1), icon: "briefcase" as IconName, hue: "neutral" };
}

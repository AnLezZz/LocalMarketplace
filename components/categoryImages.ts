/** Photos used when a category has no uploaded image. The key is the main category's slug; its sub-categories inherit it. An uploaded image always wins. */
const FALLBACKS: Record<string, string> = {
  "car-detailing": "/images/category/car-detailing.jpg",
  "gardening": "/images/category/gardening.jpg",
  "moving-help": "/images/category/moving-help.jpg",
};

const norm = (slug: string) => slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function categoryImage(slug: string, uploaded: string | null | undefined): string | null {
  if (uploaded) return uploaded;
  const s = norm(slug);
  const key = Object.keys(FALLBACKS).find((k) => s === k || s.startsWith(`${k}-`));
  return key ? FALLBACKS[key] : null;
}

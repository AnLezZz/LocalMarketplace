/** Stand-in photos for a business that has not uploaded one, chosen by its main category. Sub-categories inherit their parent's. Anything else keeps the initials disc. */
const PHOTOS: Record<string, string> = {
  "car-detailing": "/images/business/car-detailing.jpg",
  "gardening": "/images/business/gardening.jpg",
  "moving-help": "/images/business/moving-help.jpg",
};

export function providerFallbackPhoto(category?: string): string | undefined {
  if (!category) return undefined;
  const s = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const key = Object.keys(PHOTOS).find((k) => s === k || s.startsWith(`${k}-`));
  return key ? PHOTOS[key] : undefined;
}

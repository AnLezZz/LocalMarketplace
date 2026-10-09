export const CATEGORY_META: Record<string, { emoji: string; hue: number }> = {
  cleaning: { emoji: "✨", hue: 160 },
  gardening: { emoji: "🌿", hue: 135 },
  handyman: { emoji: "🔧", hue: 35 },
  "pet care": { emoji: "🐾", hue: 15 },
  "car detailing": { emoji: "🚗", hue: 215 },
  "moving help": { emoji: "📦", hue: 270 },
};
export const meta = (c: string) => CATEGORY_META[c] ?? { emoji: "•", hue: 150 };
export const price = (p: { rateCents: number; rateBasis: string }) =>
  `$${Math.round(p.rateCents / 100)}${p.rateBasis === "hourly" ? "/hr" : ""}`;

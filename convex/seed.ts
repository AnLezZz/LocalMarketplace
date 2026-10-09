import { mutationGeneric as mutation } from "convex/server";

// Run once: npx convex run seed:run
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    if ((await ctx.db.query("providers").first()) !== null) return "already seeded";
    const base = { approved: true, ratingAvg: 4.8, reviewCount: 12 };
    const rows = [
      { name: "Sparkle & Shine Cleaning", category: "cleaning", suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const, bio: "Eco-friendly home cleaning, 8 years experience." },
      { name: "Green Thumb Gardens", category: "gardening", suburb: "Ponsonby", rateCents: 5500, rateBasis: "hourly" as const, bio: "Lawns, hedges and garden tidy-ups." },
      { name: "Fixit Fred", category: "handyman", suburb: "Grey Lynn", rateCents: 7000, rateBasis: "hourly" as const, bio: "Flatpack, shelving, small repairs." },
      { name: "Happy Paws Walkers", category: "pet care", suburb: "Grey Lynn", rateCents: 3000, rateBasis: "hourly" as const, bio: "Dog walking and pet sitting." },
      { name: "Mirror Finish Detailing", category: "car detailing", suburb: "Mt Eden", rateCents: 12000, rateBasis: "fixed" as const, bio: "Full interior and exterior detail, we come to you." },
      { name: "Two Men & A Ute", category: "moving help", suburb: "Mt Eden", rateCents: 8500, rateBasis: "hourly" as const, bio: "Small moves and tip runs." },
    ];
    for (const r of rows) await ctx.db.insert("providers", { ...r, ...base });
    return `seeded ${rows.length}`;
  },
});

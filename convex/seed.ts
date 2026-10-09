import { internalMutation } from "./_generated/server";

// Run once: npx convex run seed:run
export const run = internalMutation({
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

export const setupDemoAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const providerUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "provider@localhub.nz"))
      .unique();

    if (!providerUser) return "provider user not found";
    await ctx.db.patch(providerUser._id, { role: "provider", name: "Alex Morgan" });

    let provider = await ctx.db
      .query("providers")
      .withIndex("by_userId", (q) => q.eq("userId", providerUser._id))
      .unique();

    if (!provider) {
      const pid = await ctx.db.insert("providers", {
        name: "Alex Morgan",
        bio: "Professional lawn care, hedge trimming, and garden maintenance across Auckland.",
        category: "gardening",
        suburb: "Mount Eden",
        rateCents: 4500,
        rateBasis: "hourly",
        ratingAvg: 4.9,
        reviewCount: 28,
        approved: true,
        userId: providerUser._id,
        submittedAt: Date.now(),
      });
      provider = await ctx.db.get(pid);
    } else {
      await ctx.db.patch(provider._id, {
        approved: true,
        ratingAvg: 4.9,
        reviewCount: 28,
      });
    }

    const existingBookings = await ctx.db
      .query("bookings")
      .withIndex("by_provider", (q) => q.eq("providerId", provider!._id))
      .collect();

    if (existingBookings.length === 0) {
      const now = Date.now();
      const oneHour = 3600 * 1000;
      const oneDay = 24 * oneHour;

      await ctx.db.insert("bookings", {
        providerId: provider!._id,
        customerName: "Sarah Kim",
        customerEmail: "sarah@example.nz",
        description: "Lawn mowing & edge trimming",
        startsAt: now + oneDay + 2 * oneHour,
        endsAt: now + oneDay + 4 * oneHour,
        status: "requested",
      });

      await ctx.db.insert("bookings", {
        providerId: provider!._id,
        customerName: "Michael Chen",
        customerEmail: "michael@example.nz",
        description: "Garden tidy up and weed removal",
        startsAt: now + 2 * oneDay + 4 * oneHour,
        endsAt: now + 2 * oneDay + 6 * oneHour,
        status: "accepted",
      });

      await ctx.db.insert("bookings", {
        providerId: provider!._id,
        customerName: "Emma Wilson",
        customerEmail: "emma@example.nz",
        description: "Hedge trimming (front and back)",
        startsAt: now + 3 * oneDay + 1 * oneHour,
        endsAt: now + 3 * oneDay + 3 * oneHour,
        status: "accepted",
      });

      await ctx.db.insert("bookings", {
        providerId: provider!._id,
        customerName: "David Park",
        customerEmail: "david@example.nz",
        description: "General green waste clean up",
        startsAt: now - 2 * oneDay,
        endsAt: now - 2 * oneDay + 2 * oneHour,
        status: "completed",
      });
    }

    return "setup demo accounts complete";
  },
});


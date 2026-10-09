import { getDb } from "./client";
import { providers } from "./schema";

const rows = [
  { name: "Sparkle & Shine Cleaning", category: "cleaning", suburb: "Ponsonby", rateCents: 4500, bio: "Eco-friendly home cleaning, 8 years experience." },
  { name: "Green Thumb Gardens", category: "gardening", suburb: "Ponsonby", rateCents: 5500, bio: "Lawns, hedges and garden tidy-ups." },
  { name: "Fixit Fred", category: "handyman", suburb: "Grey Lynn", rateCents: 7000, bio: "Flatpack, shelving, small repairs." },
  { name: "Happy Paws Walkers", category: "pet care", suburb: "Grey Lynn", rateCents: 3000, bio: "Dog walking and pet sitting." },
  { name: "Mirror Finish Detailing", category: "car detailing", suburb: "Mt Eden", rateCents: 12000, rateBasis: "fixed", bio: "Full interior and exterior detail, we come to you." },
  { name: "Two Men & A Ute", category: "moving help", suburb: "Mt Eden", rateCents: 8500, bio: "Small moves and tip runs." },
].map((r) => ({ ...r, approved: true, ratingAvg: "4.8", reviewCount: 12 }));

await getDb().insert(providers).values(rows);
console.log("seeded", rows.length);

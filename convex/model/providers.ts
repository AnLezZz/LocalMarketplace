import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { CATEGORIES } from "./categories";

export type ProviderStatus = "pending" | "approved" | "rejected";

export function providerStatus(p: Doc<"providers">): ProviderStatus {
  if (p.approved) return "approved";
  return p.reviewedAt !== undefined ? "rejected" : "pending";
}

export async function getProviderForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"providers"> | null> {
  return await ctx.db.query("providers").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
}

export type ProfileInput = {
  name: string; bio: string; category: string; suburb: string;
  rateCents: number; rateBasis: "hourly" | "fixed";
};

export function validateProfile(input: ProfileInput): ProfileInput {
  const name = input.name.trim();
  const bio = input.bio.trim();
  const suburb = input.suburb.trim();
  if (!name || !bio || !suburb) throw new ConvexError("Name, bio and suburb are required");
  if (name.length > 80 || suburb.length > 60 || bio.length > 1000) throw new ConvexError("One of the fields is too long");
  if (!(CATEGORIES as readonly string[]).includes(input.category)) throw new ConvexError("Unknown category");
  if (!Number.isInteger(input.rateCents) || input.rateCents < 100 || input.rateCents > 100_000) {
    throw new ConvexError("Rate must be between $1 and $1,000");
  }
  return { name, bio, category: input.category, suburb, rateCents: input.rateCents, rateBasis: input.rateBasis };
}

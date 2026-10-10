import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUser } from "./auth";
import { getProviderForUser } from "./providers";

export type ServiceInput = {
  name: string; description: string; priceType: "fixed" | "hourly" | "quote";
  priceCents?: number; durationMinutes: number;
};

export function validateService(input: ServiceInput): ServiceInput {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new ConvexError("Give the service a name");
  if (name.length > 80 || description.length > 500) throw new ConvexError("One of the fields is too long");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 720 || input.durationMinutes % 15) {
    throw new ConvexError("Duration must be 15 minutes to 12 hours, in 15 minute steps");
  }
  if (input.priceType === "quote") return { name, description, priceType: "quote", durationMinutes: input.durationMinutes };
  const cents = input.priceCents;
  if (cents === undefined || !Number.isInteger(cents) || cents < 100 || cents > 100_000) throw new ConvexError("Price must be between $1 and $1,000");
  return { name, description, priceType: input.priceType, priceCents: cents, durationMinutes: input.durationMinutes };
}

/** The signed-in user's own provider profile. Services are private to its owner for writes. */
export async function requireOwnProvider(ctx: QueryCtx | MutationCtx): Promise<Doc<"providers">> {
  const user = await getUser(ctx);
  if (!user) throw new ConvexError("Sign in required");
  const provider = await getProviderForUser(ctx, user._id);
  if (!provider) throw new ConvexError("Create your provider profile first");
  return provider;
}

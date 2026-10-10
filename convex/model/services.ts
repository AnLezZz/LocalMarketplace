import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUser } from "./auth";
import { getProviderForUser } from "./providers";

import { validateMeetingLink, validateVenue, type ServiceMode, type Venue } from "./serviceLocation";

export type ServiceInput = {
  name: string; description: string; priceType: "fixed" | "hourly" | "quote";
  priceCents?: number; durationMinutes: number;
  categorySlug?: string; locationMode?: ServiceMode;
  venue?: { name?: string; address?: string; suburb?: string; notes?: string }; onlineNote?: string; meetingLink?: string;
};
export type ServiceFields = Omit<ServiceInput, "venue"> & { venue?: Venue };

/** What the location settings keep: only the fields that belong to the chosen mode, so a service never carries stale venue or link details. */
function locationFields(input: ServiceInput): Pick<ServiceFields, "locationMode" | "venue" | "onlineNote" | "meetingLink"> {
  const mode = input.locationMode;
  if (mode === undefined || mode === "customer") return mode ? { locationMode: mode } : {};
  if (mode === "provider" || mode === "either") return { locationMode: mode, venue: validateVenue(input.venue) };
  if (mode === "online") {
    const note = (input.onlineNote ?? "").trim();
    if (note.length > 200) throw new ConvexError("That note is too long");
    const link = validateMeetingLink(input.meetingLink);
    return { locationMode: "online", ...(note ? { onlineNote: note } : {}), ...(link ? { meetingLink: link } : {}) };
  }
  throw new ConvexError("Choose where the service happens");
}

export function validateService(input: ServiceInput): ServiceFields {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new ConvexError("Give the service a name");
  if (name.length > 80 || description.length > 500) throw new ConvexError("One of the fields is too long");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 720 || input.durationMinutes % 15) {
    throw new ConvexError("Duration must be 15 minutes to 12 hours, in 15 minute steps");
  }
  const extra = { ...(input.categorySlug ? { categorySlug: input.categorySlug } : {}), ...locationFields(input) };
  if (input.priceType === "quote") return { name, description, priceType: "quote", durationMinutes: input.durationMinutes, ...extra };
  const cents = input.priceCents;
  if (cents === undefined || !Number.isInteger(cents) || cents < 100 || cents > 100_000) throw new ConvexError("Price must be between $1 and $1,000");
  return { name, description, priceType: input.priceType, priceCents: cents, durationMinutes: input.durationMinutes, ...extra };
}

/** The signed-in user's own provider profile. Services are private to its owner for writes. */
export async function requireOwnProvider(ctx: QueryCtx | MutationCtx): Promise<Doc<"providers">> {
  const user = await getUser(ctx);
  if (!user) throw new ConvexError("Sign in required");
  const provider = await getProviderForUser(ctx, user._id);
  if (!provider) throw new ConvexError("Create your provider profile first");
  return provider;
}

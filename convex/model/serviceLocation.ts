import { ConvexError, v } from "convex/values";

/** Where a service happens. A service saved before this existed has no mode and behaves as "customer" (the customer's own address). */
export const locationModeValidator = v.union(v.literal("customer"), v.literal("provider"), v.literal("online"), v.literal("either"));
/** Where one booking happens. "either" is a service setting only: a booking is always one concrete place. */
export const bookingModeValidator = v.union(v.literal("customer"), v.literal("provider"), v.literal("online"));
export const venueValidator = v.object({ name: v.string(), address: v.string(), suburb: v.string(), notes: v.optional(v.string()) });

export type ServiceMode = "customer" | "provider" | "online" | "either";
export type BookingMode = "customer" | "provider" | "online";
export type Venue = { name: string; address: string; suburb: string; notes?: string };

const squash = (s: string) => s.trim().replace(/\s+/g, " ");

export function validateVenue(input: { name?: string; address?: string; suburb?: string; notes?: string } | undefined): Venue {
  const name = squash(input?.name ?? ""), address = squash(input?.address ?? ""), suburb = squash(input?.suburb ?? ""), notes = (input?.notes ?? "").trim();
  if (address.length < 5) throw new ConvexError("Enter the street address customers should come to");
  if (!suburb) throw new ConvexError("Enter the suburb of your premises");
  if (name.length > 80 || address.length > 200 || suburb.length > 60 || notes.length > 300) throw new ConvexError("One of the venue fields is too long");
  return { name: name || "Our premises", address, suburb, ...(notes ? { notes } : {}) };
}

/** A meeting link is a private detail: https only, so nothing odd can be stored and later shown as a link. */
export function validateMeetingLink(raw: string | undefined): string | undefined {
  const link = (raw ?? "").trim();
  if (!link) return undefined;
  let url: URL;
  try { url = new URL(link); } catch { throw new ConvexError("Enter the meeting link as a full web address, starting with https://"); }
  if (url.protocol !== "https:" || link.length > 300) throw new ConvexError("The meeting link must be a web address starting with https://");
  return link;
}

/**
 * The one place a booking will happen. A service with a fixed mode refuses any other choice; "either" needs the customer to choose
 * between the customer's address and the provider's premises. Anything else is a manipulated request, refused by the server.
 */
export function bookingMode(serviceMode: ServiceMode | undefined, choice: BookingMode | undefined): BookingMode {
  const mode = serviceMode ?? "customer";
  if (mode !== "either") {
    if (choice !== undefined && choice !== mode) throw new ConvexError("That service isn't offered there");
    return mode;
  }
  if (choice !== "customer" && choice !== "provider") throw new ConvexError("Choose where you want this service");
  return choice;
}

/** Phone and sharing preference, for bookings where no customer address is collected. */
export function validateContact(input: { shareContact: boolean; phone?: string }) {
  const phone = input.phone ? input.phone.replace(/[\s()-]/g, "") : "";
  if (phone && !/^\+?\d{7,15}$/.test(phone)) throw new ConvexError("Enter a valid phone number, or leave it blank");
  if (input.shareContact && !phone) throw new ConvexError("Add a phone number to share your contact details");
  return { shareContact: input.shareContact, ...(phone ? { customerPhone: phone } : {}) };
}

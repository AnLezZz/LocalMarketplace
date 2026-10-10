import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export type JobInput = { address: string; suburb: string; accessNotes?: string; shareContact: boolean; phone?: string };
export type JobDetails = { address: string; suburb: string; accessNotes?: string; shareContact: boolean; customerPhone?: string };

export const norm = (s: string) => s.trim().replace(/\s+/g, " ");

export function validateJob(input: JobInput): JobDetails {
  const address = norm(input.address), suburb = norm(input.suburb);
  const accessNotes = input.accessNotes ? input.accessNotes.trim() : "";
  if (address.length < 5) throw new ConvexError("Enter the street address for the job");
  if (!suburb) throw new ConvexError("Enter the suburb");
  if (address.length > 200 || suburb.length > 60 || accessNotes.length > 500) throw new ConvexError("One of the fields is too long");
  const phone = input.phone ? input.phone.replace(/[\s()-]/g, "") : "";
  if (phone && !/^\+?\d{7,15}$/.test(phone)) throw new ConvexError("Enter a valid phone number, or leave it blank");
  if (input.shareContact && !phone) throw new ConvexError("Add a phone number to share your contact details");
  return { address, suburb, shareContact: input.shareContact, ...(accessNotes ? { accessNotes } : {}), ...(phone ? { customerPhone: phone } : {}) };
}

/** Does the provider take jobs in this suburb? No list means anywhere; their own suburb always counts. */
export function servesSuburb(provider: Pick<Doc<"providers">, "suburb" | "serviceSuburbs">, suburb: string): boolean {
  const list = provider.serviceSuburbs ?? [];
  if (list.length === 0) return true;
  const want = norm(suburb).toLowerCase();
  return [provider.suburb, ...list].some((s) => norm(s).toLowerCase() === want);
}

/** Address, access notes and contact are private to the customer until the provider has accepted the job. */
export function providerMaySeePrivate(status: Doc<"bookings">["status"]): boolean {
  return status === "accepted" || status === "completed";
}

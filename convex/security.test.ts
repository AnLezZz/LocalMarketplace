/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createProvider, createUser, newT } from "../test-utils/harness";

const all = import.meta.glob(["./**/*.ts", "!./_generated/**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = Object.entries(all).filter(([path]) => !path.endsWith(".test.ts"));

// When this fails, a public mutation was added or removed. Add it to the signed-out sweep below.
const PUBLIC_MUTATIONS = [
  "account.addAddress", "account.generateUploadUrl", "account.removeAddress", "account.removePhoto", "account.setDefaultAddress", "account.setEmailPrefs", "account.setPhoto", "account.updateProfile",
  "admin.cancelBooking", "admin.reactivateProvider", "admin.reactivateUser", "admin.resolveDispute", "admin.resolveReviewReport", "admin.restoreReview", "admin.review", "admin.suspendProvider", "admin.suspendUser", "availability.addTimeOff", "availability.removeTimeOff", "availability.setHours",
  "bookings.create", "bookings.respondToQuote", "bookings.submitQuote", "bookings.transition", "categories.create", "categories.generateUploadUrl", "categories.initDefaults", "categories.move", "categories.remove", "categories.removeImage", "categories.seedExamples", "categories.setEnabled", "categories.setFeatured", "categories.setImage", "categories.update", "disputes.open", "favourites.toggle", "locations.addSuburbs", "locations.dismissReview", "locations.removeSuburb", "locations.resolveReview", "locations.setAreaOpen", "locations.setCity", "locations.setSuburbEnabled", "notifications.markAllRead", "notifications.markRead", "providers.addGalleryPhoto", "providers.addServiceArea", "providers.generateUploadUrl", "providers.removeGalleryPhoto", "providers.removePhoto", "providers.removeServiceArea", "providers.setPhoto", "providers.setServiceAreas", "providers.submitProfile", "providers.updateProfile", "reschedules.propose", "reschedules.respond", "reschedules.withdraw", "reviews.create", "reviews.report",
  "services.archive", "services.create", "services.setEnabled", "services.update",
];
// A public action can write via ctx.runMutation. Add one here deliberately and give it its own signed-out check.
const PUBLIC_ACTIONS: string[] = [];

function inventory(builders: string): string[] {
  const re = new RegExp(`export\\s+const\\s+(\\w+)\\s*(?::[^=]+)?=\\s*(?:${builders})\\s*\\(`, "g");
  const found: string[] = [];
  for (const [path, src] of sources) {
    const file = path.replace(/^\.\//, "").replace(/\.ts$/, "");
    for (const m of src.matchAll(re)) found.push(`${file}.${m[1]}`);
  }
  return found.sort();
}

test("the generic function builders are never used", () => {
  // They are the only way to build a public function that dodges the scans below (e.g. via an alias).
  const offenders = sources.filter(([, src]) => /\b(mutationGeneric|actionGeneric|queryGeneric)\b/.test(src)).map(([p]) => p);
  expect(offenders).toEqual([]);
});

test("the public mutation inventory is explicit", () => {
  expect(inventory("mutation")).toEqual(PUBLIC_MUTATIONS);
});

test("the public action inventory is explicit", () => {
  expect(inventory("action|httpAction")).toEqual(PUBLIC_ACTIONS);
});

test("every public mutation refuses a signed-out caller", async () => {
  const t = newT();
  const owner = await createUser(t, "provider");
  const providerId = await createProvider(t, owner);
  const startsAt = Date.now() + 86_400_000;
  const bookingId = await t.run((ctx) =>
    ctx.db.insert("bookings", {
      providerId, customerName: "x", customerEmail: "x@example.nz", description: "x",
      startsAt, endsAt: startsAt + 3_600_000, status: "requested",
    }),
  );
  const customerId = await createUser(t, "customer");
  const reviewId = await t.run((ctx) => ctx.db.insert("reviews", { bookingId, providerId, customerId, customerName: "x", rating: 5, text: "" }));
  const reportId = await t.run((ctx) => ctx.db.insert("reviewReports", { reviewId, providerId, reporterId: owner, reason: "unfair review", status: "open" }));
  const disputeId = await t.run((ctx) => ctx.db.insert("disputes", { bookingId, openedById: customerId, openedBy: "customer", reason: "something went wrong", status: "open" }));
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "image/png" })));
  const requestId = await t.run((ctx) => ctx.db.insert("rescheduleRequests", { bookingId, proposedBy: "customer", proposerId: customerId, newStartsAt: startsAt + 86_400_000, newEndsAt: startsAt + 90_000_000, status: "pending" }));
  const categoryId = await t.run((ctx) => ctx.db.insert("categories", { slug: "roofing", label: "Roofing", icon: "home", hue: "neutral", order: 0, enabled: true }));
  const suburbId = await t.run((ctx) => ctx.db.insert("suburbs", { name: "Ponsonby", key: "ponsonby", enabled: true }));
  const placeId = await t.run((ctx) => ctx.db.insert("places", { source: "linz", layer: "suburbs_localities", sourceId: "1", kind: "suburb", selectable: true, name: "Ponsonby", nameAscii: "Ponsonby", key: "ponsonby", altNames: [], altKeys: [], regionIds: [], taIds: [], flags: [], active: true, runId: "t" }));
  const reviewId2 = await t.run((ctx) => ctx.db.insert("locationReviews", { providerId, field: "base", raw: "x", reason: "unmatched", candidateIds: [placeId], status: "open" }));
  const calls = [
    () => t.mutation(api.locations.setAreaOpen, { placeId, open: false }),
    () => t.mutation(api.locations.resolveReview, { reviewId: reviewId2, placeId }),
    () => t.mutation(api.locations.dismissReview, { reviewId: reviewId2 }),
    () => t.mutation(api.providers.addServiceArea, { placeId }),
    () => t.mutation(api.providers.removeServiceArea, { placeId }),
    () => t.mutation(api.admin.review, { providerId, decision: "approve", submittedAt: 1 }),
    () => t.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "A", description: "d", startsAt, endsAt: startsAt + 3_600_000 }),
    () => t.mutation(api.bookings.transition, { bookingId, to: "accepted" }),
    () => t.mutation(api.providers.submitProfile, {
      name: "N", bio: "B", category: "cleaning", suburb: "S", rateCents: 4500, rateBasis: "hourly",
    }),
    () => t.mutation(api.admin.suspendProvider, { providerId, reason: "reason" }),
    () => t.mutation(api.admin.reactivateProvider, { providerId }),
    () => t.mutation(api.admin.suspendUser, { userId: customerId, reason: "reason" }),
    () => t.mutation(api.admin.reactivateUser, { userId: customerId }),
    () => t.mutation(api.admin.cancelBooking, { bookingId, reason: "reason" }),
    () => t.mutation(api.disputes.open, { bookingId, reason: "something went wrong here" }),
    () => t.mutation(api.reviews.report, { reviewId: reviewId, reason: "this is unfair and untrue" }),
    () => t.mutation(api.admin.resolveReviewReport, { reportId: reportId, action: "dismiss" }),
    () => t.mutation(api.admin.restoreReview, { reviewId: reviewId }),
    () => t.mutation(api.admin.resolveDispute, { disputeId: disputeId, resolution: "resolved for the test" }),
    () => t.mutation(api.reschedules.propose, { bookingId, newStartsAt: startsAt + 86_400_000 }),
    () => t.mutation(api.reschedules.respond, { requestId, accept: true }),
    () => t.mutation(api.reschedules.withdraw, { requestId }),
    () => t.mutation(api.bookings.submitQuote, { bookingId, amountCents: 5000 }),
    () => t.mutation(api.bookings.respondToQuote, { bookingId, accept: true }),
    () => t.mutation(api.categories.initDefaults, {}),
    () => t.mutation(api.categories.create, { label: "Roofing", icon: "home", hue: "neutral" }),
    () => t.mutation(api.categories.update, { id: categoryId, label: "Roofing", icon: "home", hue: "neutral" }),
    () => t.mutation(api.categories.setEnabled, { id: categoryId, enabled: false }),
    () => t.mutation(api.categories.move, { id: categoryId, direction: "up" }),
    () => t.mutation(api.categories.setFeatured, { id: categoryId, featured: true }),
    () => t.mutation(api.categories.remove, { id: categoryId }),
    () => t.mutation(api.categories.generateUploadUrl, {}),
    () => t.mutation(api.categories.setImage, { id: categoryId, storageId }),
    () => t.mutation(api.categories.removeImage, { id: categoryId }),
    () => t.mutation(api.categories.seedExamples, {}),
    () => t.mutation(api.locations.setCity, { city: "Auckland" }),
    () => t.mutation(api.locations.addSuburbs, { names: ["Ponsonby"] }),
    () => t.mutation(api.locations.setSuburbEnabled, { id: suburbId, enabled: false }),
    () => t.mutation(api.locations.removeSuburb, { id: suburbId }),
    () => t.mutation(api.account.updateProfile, { name: "N" }),
    () => t.mutation(api.account.generateUploadUrl, {}),
    () => t.mutation(api.account.setPhoto, { storageId }),
    () => t.mutation(api.account.removePhoto, {}),
    () => t.mutation(api.account.addAddress, { label: "Home", address: "12 Test Street", suburb: "Ponsonby" }),
    () => t.mutation(api.account.removeAddress, { id: "x" }),
    () => t.mutation(api.account.setDefaultAddress, { id: "x" }),
    () => t.mutation(api.account.setEmailPrefs, { updates: true, reminders: true, reviews: true }),
    () => t.mutation(api.providers.setServiceAreas, { suburbs: [] }),
    () => t.mutation(api.providers.updateProfile, { name: "N", bio: "B", category: "cleaning", suburb: "S", rateCents: 4500, rateBasis: "hourly" }),
    () => t.mutation(api.providers.generateUploadUrl, {}),
    () => t.mutation(api.providers.setPhoto, { storageId }),
    () => t.mutation(api.providers.removePhoto, {}),
    () => t.mutation(api.providers.addGalleryPhoto, { storageId }),
    () => t.mutation(api.providers.removeGalleryPhoto, { id: "x" }),
    () => t.mutation(api.favourites.toggle, { providerId }),
    () => t.mutation(api.notifications.markRead, { id: "x" }),
    () => t.mutation(api.notifications.markAllRead, {}),
    () => t.mutation(api.reviews.create, { bookingId, rating: 5, text: "" }),
    () => t.mutation(api.availability.setHours, { hours: [] }),
    () => t.mutation(api.availability.addTimeOff, { startsAt: startsAt, endsAt: startsAt + 3_600_000 }),
    () => t.mutation(api.availability.removeTimeOff, { id: "x" }),
    () => t.mutation(api.services.create, { name: "Mow", description: "", priceType: "fixed", priceCents: 5000, durationMinutes: 60 }),
    () => t.mutation(api.services.update, { id: "x", name: "Mow", description: "", priceType: "fixed", priceCents: 5000, durationMinutes: 60 }),
    () => t.mutation(api.services.setEnabled, { id: "x", enabled: false }),
    () => t.mutation(api.services.archive, { id: "x" }),
  ];
  expect(calls).toHaveLength(PUBLIC_MUTATIONS.length);
  for (const call of calls) await expect(call()).rejects.toThrow("Sign in required");
});

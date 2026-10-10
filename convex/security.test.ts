/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createProvider, createUser, newT } from "../test-utils/harness";

const all = import.meta.glob(["./**/*.ts", "!./_generated/**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = Object.entries(all).filter(([path]) => !path.endsWith(".test.ts"));

// When this fails, a public mutation was added or removed. Add it to the signed-out sweep below.
const PUBLIC_MUTATIONS = [
  "admin.review", "availability.addTimeOff", "availability.removeTimeOff", "availability.setHours",
  "bookings.create", "bookings.respondToQuote", "bookings.submitQuote", "bookings.transition", "favourites.toggle", "notifications.markAllRead", "notifications.markRead", "providers.setServiceAreas", "providers.submitProfile", "reviews.create",
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
  const calls = [
    () => t.mutation(api.admin.review, { providerId, decision: "approve", submittedAt: 1 }),
    () => t.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "A", description: "d", startsAt, endsAt: startsAt + 3_600_000 }),
    () => t.mutation(api.bookings.transition, { bookingId, to: "accepted" }),
    () => t.mutation(api.providers.submitProfile, {
      name: "N", bio: "B", category: "cleaning", suburb: "S", rateCents: 4500, rateBasis: "hourly",
    }),
    () => t.mutation(api.bookings.submitQuote, { bookingId, amountCents: 5000 }),
    () => t.mutation(api.bookings.respondToQuote, { bookingId, accept: true }),
    () => t.mutation(api.providers.setServiceAreas, { suburbs: [] }),
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

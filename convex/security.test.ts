/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createProvider, createUser, newT } from "../test-utils/harness";

const sources = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// When this fails, a public mutation was added or removed. Add it to the signed-out sweep below.
const PUBLIC_MUTATIONS = ["admin.review", "bookings.create", "bookings.transition", "providers.submitProfile"];

test("the public mutation inventory is explicit", () => {
  const found: string[] = [];
  for (const [path, src] of Object.entries(sources)) {
    if (path.endsWith(".test.ts")) continue;
    const file = path.replace("./", "").replace(".ts", "");
    for (const m of src.matchAll(/export const (\w+) = (?:mutation|mutationGeneric)\(/g)) found.push(`${file}.${m[1]}`);
  }
  expect(found.sort()).toEqual(PUBLIC_MUTATIONS);
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
    () => t.mutation(api.admin.review, { providerId, decision: "approve" }),
    () => t.mutation(api.bookings.create, { providerId, customerName: "A", description: "d", startsAt, endsAt: startsAt + 3_600_000 }),
    () => t.mutation(api.bookings.transition, { bookingId, to: "accepted" }),
    () => t.mutation(api.providers.submitProfile, {
      name: "N", bio: "B", category: "cleaning", suburb: "S", rateCents: 4500, rateBasis: "hourly",
    }),
  ];
  expect(calls).toHaveLength(PUBLIC_MUTATIONS.length);
  for (const call of calls) await expect(call()).rejects.toThrow("Sign in required");
});

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

const HOUR = 3_600_000;

async function setup() {
  const t = newT();
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { ratingAvg: 0, reviewCount: 0 });
  const customerId = await createUser(t, "customer", "kiri@example.nz");
  await t.run((ctx) => ctx.db.patch(customerId, { name: "Kiri Tane" }));
  const customer = asUser(t, customerId);
  const owner = asUser(t, ownerId);
  const stranger = asUser(t, await createUser(t, "customer"));
  let n = 0;
  const book = async (status: "requested" | "accepted" | "completed" = "completed") => {
    const startsAt = Date.now() + (24 + 3 * n++) * HOUR;
    const id = await customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "Kiri", description: "d", startsAt, endsAt: startsAt + HOUR });
    if (status !== "requested") await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    if (status === "completed") await owner.mutation(api.bookings.transition, { bookingId: id, to: "completed" });
    return id;
  };
  return { t, providerId, customer, owner, stranger, book };
}

describe("reviews.create", () => {
  test("a customer reviews a completed booking once; the provider's rating follows", async () => {
    const { t, providerId, customer, book } = await setup();
    const first = await book();
    await customer.mutation(api.reviews.create, { bookingId: first, rating: 5, text: "  Great work  " });
    expect(await t.run((ctx) => ctx.db.get(providerId))).toMatchObject({ ratingAvg: 5, reviewCount: 1 });
    const second = await book();
    await customer.mutation(api.reviews.create, { bookingId: second, rating: 4, text: "" });
    expect(await t.run((ctx) => ctx.db.get(providerId))).toMatchObject({ ratingAvg: 4.5, reviewCount: 2 });

    const listed = await t.query(api.reviews.forProvider, { providerId });
    expect(listed).toHaveLength(2);
    expect(listed.find((r) => r.text === "Great work")).toMatchObject({ customerName: "Kiri", rating: 5 }); // first name only
    expect(await customer.query(api.reviews.mine, {})).toHaveLength(2);
  });

  test("blocks duplicates, unfinished bookings, other people's bookings and bad ratings", async () => {
    const { t, customer, stranger, book } = await setup();
    const done = await book();
    await expect(customer.mutation(api.reviews.create, { bookingId: done, rating: 0, text: "" })).rejects.toThrow("1 to 5");
    await expect(customer.mutation(api.reviews.create, { bookingId: done, rating: 3.5, text: "" })).rejects.toThrow("1 to 5");
    await expect(customer.mutation(api.reviews.create, { bookingId: done, rating: 6, text: "" })).rejects.toThrow("1 to 5");
    await expect(customer.mutation(api.reviews.create, { bookingId: done, rating: 5, text: "x".repeat(1001) })).rejects.toThrow("too long");
    await expect(stranger.mutation(api.reviews.create, { bookingId: done, rating: 5, text: "" })).rejects.toThrow("booking not found");
    await expect(t.mutation(api.reviews.create, { bookingId: done, rating: 5, text: "" })).rejects.toThrow("Sign in required");
    await customer.mutation(api.reviews.create, { bookingId: done, rating: 5, text: "" });
    await expect(customer.mutation(api.reviews.create, { bookingId: done, rating: 1, text: "" })).rejects.toThrow("already reviewed");
    const open = await book("accepted");
    await expect(customer.mutation(api.reviews.create, { bookingId: open, rating: 5, text: "" })).rejects.toThrow("once it is completed");
    const pending = await book("requested");
    await expect(customer.mutation(api.reviews.create, { bookingId: pending, rating: 5, text: "" })).rejects.toThrow("once it is completed");
  });

  test("the provider cannot review their own jobs, and only approved providers show reviews", async () => {
    const { t, providerId, owner, customer, book } = await setup();
    const id = await book();
    await expect(owner.mutation(api.reviews.create, { bookingId: id, rating: 5, text: "" })).rejects.toThrow("booking not found");
    await customer.mutation(api.reviews.create, { bookingId: id, rating: 5, text: "ok" });
    await t.run((ctx) => ctx.db.patch(providerId, { approved: false }));
    expect(await t.query(api.reviews.forProvider, { providerId })).toEqual([]);
  });
});

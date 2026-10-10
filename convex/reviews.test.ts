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

    const listed = (await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 50, cursor: null } })).page;
    expect(listed).toHaveLength(2);
    expect(listed.find((r) => r.text === "Great work")).toMatchObject({ customerName: "Kiri", rating: 5 }); // first name only
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
    expect((await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([]);
  });
});

describe("public reviews paging", () => {
  test("pages are full, hidden reviews never appear, and an unapproved provider shows nothing", async () => {
    const t = newT();
    const providerId = await createProvider(t, undefined, { approved: true });
    const hiddenProviderId = await createProvider(t, undefined, { approved: false });
    const customerId = await createUser(t, "customer");
    const insert = (pid: typeof providerId, i: number, hidden: boolean) => t.run(async (ctx) => {
      const bookingId = await ctx.db.insert("bookings", { providerId: pid, customerId, customerName: "Kiri", customerEmail: "k@example.nz", description: "job", startsAt: Date.now() + i, endsAt: Date.now() + i + 1, status: "completed" });
      return ctx.db.insert("reviews", { bookingId, providerId: pid, customerId, customerName: `Kiri ${i}`, rating: 5, text: `review ${i}`, ...(hidden ? { hidden: true, hiddenReason: "x" } : {}) } as never);
    });
    for (let i = 0; i < 25; i++) await insert(providerId, i, i % 5 === 0); // 5 hidden, 20 shown
    await insert(hiddenProviderId, 99, false);
    const all: string[] = []; let cursor: string | null = null, pages = 0;
    for (; pages < 10;) {
      const r: { page: { _id: string; text: string }[]; isDone: boolean; continueCursor: string } = await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 8, cursor } });
      pages++; all.push(...r.page.map((x) => x.text));
      if (r.isDone) break;
      cursor = r.continueCursor;
    }
    expect(all).toHaveLength(20);
    expect(all.some((x) => ["review 0", "review 5", "review 10"].includes(x))).toBe(false);
    expect(all[0]).toBe("review 24"); // newest first
    expect(pages).toBe(3); // 8 + 8 + 4
    expect((await t.query(api.reviews.forProvider, { providerId: hiddenProviderId, paginationOpts: { numItems: 8, cursor: null } })).page).toEqual([]);
  });
});

describe("numbered review pages", () => {
  test("offset pages with a true total, hidden reviews excluded, and nothing for an unapproved provider", async () => {
    const t = newT();
    const providerId = await createProvider(t, undefined, { approved: true });
    const unapproved = await createProvider(t, undefined, { approved: false });
    const customerId = await createUser(t, "customer");
    await t.run(async (ctx) => {
      for (let i = 0; i < 23; i++) {
        const bookingId = await ctx.db.insert("bookings", { providerId, customerId, customerName: "Kiri", customerEmail: "k@example.nz", description: "job", startsAt: Date.now() + i, endsAt: Date.now() + i + 1, status: "completed" });
        await ctx.db.insert("reviews", { bookingId, providerId, customerId, customerName: "Kiri", rating: 5, text: `review ${i}`, ...(i === 3 ? { hidden: true, hiddenReason: "x" } : {}) } as never);
      }
    });
    const first = await t.query(api.reviews.forProviderPage, { providerId, offset: 0, limit: 10 });
    expect(first).toMatchObject({ total: 22, capped: false });
    expect(first.rows).toHaveLength(10);
    expect(first.rows[0].text).toBe("review 22"); // newest first
    const seen = [...first.rows, ...(await t.query(api.reviews.forProviderPage, { providerId, offset: 10, limit: 10 })).rows, ...(await t.query(api.reviews.forProviderPage, { providerId, offset: 20, limit: 10 })).rows];
    expect(seen).toHaveLength(22);
    expect(new Set(seen.map((r) => r._id)).size).toBe(22);
    expect(seen.some((r) => r.text === "review 3")).toBe(false);
    expect((await t.query(api.reviews.forProviderPage, { providerId, offset: 40, limit: 10 })).rows).toEqual([]);
    expect(await t.query(api.reviews.forProviderPage, { providerId: unapproved, offset: 0, limit: 10 })).toEqual({ rows: [], total: 0, capped: false });
  });
});

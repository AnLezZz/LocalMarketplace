import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { snapshotPrice, validateQuote } from "./model/pricing";

const HOUR = 3_600_000;

describe("pricing helpers", () => {
  test("snapshots hourly, fixed and quote prices", () => {
    expect(snapshotPrice("hourly", 4500, 0, 2 * HOUR)).toEqual({ priceType: "hourly", unitCents: 4500, estimateCents: 9000 });
    expect(snapshotPrice("hourly", 4500, 0, 1.5 * HOUR)).toEqual({ priceType: "hourly", unitCents: 4500, estimateCents: 6750 });
    expect(snapshotPrice("fixed", 12000, 0, 3 * HOUR)).toEqual({ priceType: "fixed", unitCents: 12000, estimateCents: 12000 });
    expect(snapshotPrice("quote", undefined, 0, HOUR)).toEqual({ priceType: "quote" });
  });
  test("validates quotes", () => {
    expect(validateQuote(12345, "  Includes waste removal ")).toEqual({ amountCents: 12345, note: "Includes waste removal" });
    expect(validateQuote(100, undefined)).toEqual({ amountCents: 100 });
    for (const bad of [99, 5_000_001, 100.5, NaN]) expect(() => validateQuote(bad, "")).toThrow("between $1 and $50,000");
    expect(() => validateQuote(1000, "x".repeat(501))).toThrow("too long");
  });
});

async function setup() {
  const t = newT();
  const ownerId = await createUser(t, "provider"), otherId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { name: "Fern Gardens", rateCents: 4500, rateBasis: "hourly" });
  await createProvider(t, otherId);
  const customer = asUser(t, await createUser(t, "customer", "kiri@example.nz"));
  const stranger = asUser(t, await createUser(t, "customer"));
  const owner = asUser(t, ownerId), other = asUser(t, otherId);
  const quoteService = await owner.mutation(api.services.create, { name: "Garden makeover", description: "", priceType: "quote", durationMinutes: 240 });
  const hourlyService = await owner.mutation(api.services.create, { name: "Mowing", description: "", priceType: "hourly", priceCents: 5000, durationMinutes: 60 });
  let n = 0;
  const book = (serviceId?: typeof quoteService, hours = 2) => {
    const startsAt = Date.now() + (30 + 5 * n++) * HOUR;
    return customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "Kiri", description: "Job", startsAt, endsAt: startsAt + hours * HOUR, serviceId });
  };
  return { t, owner, other, customer, stranger, providerId, quoteService, hourlyService, book };
}

describe("price snapshot on bookings", () => {
  test("freezes the service price and estimate; later edits do not change it", async () => {
    const { t, owner, hourlyService, book } = await setup();
    const id = await book(hourlyService, 3);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ priceType: "hourly", unitCents: 5000, estimateCents: 15000 });
    await owner.mutation(api.services.update, { id: hourlyService, name: "Mowing", description: "", priceType: "hourly", priceCents: 9000, durationMinutes: 60 });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ unitCents: 5000, estimateCents: 15000 });
  });

  test("without a service it snapshots the provider's general rate; a quote service has no number yet", async () => {
    const { t, quoteService, book } = await setup();
    expect(await t.run(async (ctx) => ctx.db.get(await book(undefined, 2)))).toMatchObject({ priceType: "hourly", unitCents: 4500, estimateCents: 9000 });
    const q = await t.run(async (ctx) => ctx.db.get(await book(quoteService)));
    expect(q).toMatchObject({ priceType: "quote" });
    expect(q?.unitCents).toBeUndefined(); expect(q?.estimateCents).toBeUndefined(); expect(q?.quoteStatus).toBeUndefined();
  });
});

describe("quote workflow", () => {
  test("quote, accept, then the provider can accept the booking; the agreed price is the quote", async () => {
    const { t, owner, customer, quoteService, book } = await setup();
    const id = await book(quoteService);
    // cannot accept before a quote exists or is accepted
    expect(await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toMatchObject({ ok: false, reason: expect.stringContaining("quote") });

    await owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 38000, note: "Includes tip run" });
    expect(await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toMatchObject({ ok: false }); // offered is not enough
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ quoteStatus: "offered", quoteCents: 38000, quoteNote: "Includes tip run" });

    await customer.mutation(api.bookings.respondToQuote, { bookingId: id, accept: true });
    expect(await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: "accepted", quoteStatus: "accepted", agreedCents: 38000 });
  });

  test("a declined quote can be revised; an accepted quote is final", async () => {
    const { t, owner, customer, quoteService, book } = await setup();
    const id = await book(quoteService);
    await owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 50000 });
    await customer.mutation(api.bookings.respondToQuote, { bookingId: id, accept: false });
    expect((await t.run((ctx) => ctx.db.get(id)))?.quoteStatus).toBe("declined");
    await owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 42000 });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ quoteStatus: "offered", quoteCents: 42000 });
    await customer.mutation(api.bookings.respondToQuote, { bookingId: id, accept: true });
    await expect(owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 99900 })).rejects.toThrow("already accepted");
    await expect(customer.mutation(api.bookings.respondToQuote, { bookingId: id, accept: false })).rejects.toThrow("no quote to respond to");
  });

  test("set-price bookings are accepted directly with the estimate as the agreed price", async () => {
    const { t, owner, hourlyService, book } = await setup();
    const id = await book(hourlyService, 2);
    await expect(owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 5000 })).rejects.toThrow("set price");
    expect(await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toEqual({ ok: true });
    expect((await t.run((ctx) => ctx.db.get(id)))?.agreedCents).toBe(10000);
  });

  test("only the owning provider can quote and only the customer can respond; closed requests refuse both", async () => {
    const { t, owner, other, customer, stranger, quoteService, book } = await setup();
    const id = await book(quoteService);
    for (const who of [other, customer, stranger]) await expect(who.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 5000 })).rejects.toThrow("booking not found");
    await expect(t.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 5000 })).rejects.toThrow("Sign in required");
    await owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 5000 });
    for (const who of [owner, other, stranger]) await expect(who.mutation(api.bookings.respondToQuote, { bookingId: id, accept: true })).rejects.toThrow("booking not found");
    await expect(owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 50 })).rejects.toThrow("between $1");
    await customer.mutation(api.bookings.transition, { bookingId: id, to: "cancelled" });
    await expect(owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 5000 })).rejects.toThrow("still open");
    await expect(customer.mutation(api.bookings.respondToQuote, { bookingId: id, accept: true })).rejects.toThrow("no longer open");
  });

  test("quote events notify the other side", async () => {
    const { t, owner, customer, quoteService, book } = await setup();
    const id = await book(quoteService);
    const kinds = async () => (await t.run((ctx) => ctx.db.query("notifications").collect())).map((n) => n.kind);
    await owner.mutation(api.bookings.submitQuote, { bookingId: id, amountCents: 38000 });
    expect(await kinds()).toContain("quote_offered");
    const offered = (await customer.query(api.notifications.mine, {}))[0];
    expect(offered).toMatchObject({ kind: "quote_offered", body: expect.stringContaining("$380"), href: `/bookings/${id}` });
    await customer.mutation(api.bookings.respondToQuote, { bookingId: id, accept: true });
    expect((await owner.query(api.notifications.mine, {}))[0]).toMatchObject({ kind: "quote_accepted", href: `/provider/bookings/${id}` });
  });

  test("details expose the price fields to the right people", async () => {
    const { owner, customer, quoteService, hourlyService, book } = await setup();
    const q = await book(quoteService), h = await book(hourlyService, 2);
    await owner.mutation(api.bookings.submitQuote, { bookingId: q, amountCents: 20000, note: "n" });
    expect(await owner.query(api.bookings.getForProvider, { id: q })).toMatchObject({ priceType: "quote", quoteCents: 20000, quoteStatus: "offered", quoteNote: "n" });
    expect(await customer.query(api.bookings.getForCustomer, { id: q })).toMatchObject({ priceType: "quote", quoteCents: 20000, quoteStatus: "offered" });
    expect(await owner.query(api.bookings.getForProvider, { id: h })).toMatchObject({ priceType: "hourly", unitCents: 5000, estimateCents: 10000 });
    const rows = await owner.query(api.bookings.listIncoming, {});
    expect(rows.find((r) => r._id === q)).toMatchObject({ priceType: "quote", quoteStatus: "offered" });
  });
});

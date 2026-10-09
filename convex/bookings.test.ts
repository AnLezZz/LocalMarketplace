import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

const HOUR = 3_600_000;
const soon = () => Date.now() + 24 * HOUR;

async function setup() {
  const t = newT();
  const customerId = await createUser(t, "customer", "cust@example.nz");
  const ownerA = await createUser(t, "provider");
  const ownerB = await createUser(t, "provider");
  const providerA = await createProvider(t, ownerA);
  const providerB = await createProvider(t, ownerB);
  const customer = asUser(t, customerId);
  const request = (providerId = providerA, startsAt = soon()) =>
    customer.mutation(api.bookings.create, { providerId, customerName: "Kiri", description: "Clean the flat", startsAt, endsAt: startsAt + 2 * HOUR });
  return { t, customerId, customer, ownerA, ownerB, providerA, providerB, a: asUser(t, ownerA), b: asUser(t, ownerB), request };
}

describe("bookings.create", () => {
  test("stamps the customer id and email from the session", async () => {
    const { t, customerId, request } = await setup();
    const id = await request();
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ customerId, customerEmail: "cust@example.nz", status: "requested" });
  });

  test("refuses signed-out callers", async () => {
    const { t, providerA } = await setup();
    await expect(
      t.mutation(api.bookings.create, { providerId: providerA, customerName: "x", description: "y", startsAt: soon(), endsAt: soon() + HOUR }),
    ).rejects.toThrow("Sign in required");
  });

  test("refuses providers that are not approved", async () => {
    const { t, customer } = await setup();
    const pending = await createProvider(t, undefined, { approved: false });
    const startsAt = soon();
    await expect(
      customer.mutation(api.bookings.create, { providerId: pending, customerName: "x", description: "y", startsAt, endsAt: startsAt + HOUR }),
    ).rejects.toThrow("provider not found");
  });

  test("refuses booking your own listing", async () => {
    const { a, providerA } = await setup();
    const startsAt = soon();
    await expect(
      a.mutation(api.bookings.create, { providerId: providerA, customerName: "x", description: "y", startsAt, endsAt: startsAt + HOUR }),
    ).rejects.toThrow("can't book yourself");
  });

  test("validates the time window and text", async () => {
    const { customer, providerA } = await setup();
    const base = { providerId: providerA, customerName: "Kiri", description: "d" };
    await expect(customer.mutation(api.bookings.create, { ...base, startsAt: soon(), endsAt: soon() })).rejects.toThrow("invalid time window");
    await expect(customer.mutation(api.bookings.create, { ...base, startsAt: Date.now() - HOUR, endsAt: soon() })).rejects.toThrow("invalid time window");
    await expect(customer.mutation(api.bookings.create, { ...base, description: "  ", startsAt: soon(), endsAt: soon() + HOUR })).rejects.toThrow("missing fields");
  });
});

describe("bookings.listIncoming and listMine", () => {
  test("each provider sees only their own bookings; the customer sees theirs", async () => {
    const { t, customer, a, b, providerB, request } = await setup();
    const forA = await request();
    const forB = await request(providerB);
    expect((await a.query(api.bookings.listIncoming, {})).map((x) => x._id)).toEqual([forA]);
    expect((await b.query(api.bookings.listIncoming, {})).map((x) => x._id)).toEqual([forB]);
    expect((await customer.query(api.bookings.listIncoming, {}))).toEqual([]);
    expect(await t.query(api.bookings.listIncoming, {})).toEqual([]);
    const mine = await customer.query(api.bookings.listMine, {});
    expect(mine.map((x) => x._id).sort()).toEqual([forA, forB].sort());
    expect(mine.every((x) => typeof x.providerName === "string")).toBe(true);
  });
});

describe("bookings.transition", () => {
  test("refuses signed-out callers", async () => {
    const { t, request } = await setup();
    const id = await request();
    await expect(t.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).rejects.toThrow("Sign in required");
  });

  test("another provider and a stranger get 'not found' and change nothing", async () => {
    const { t, b, request } = await setup();
    const stranger = asUser(t, await createUser(t, "customer"));
    const id = await request();
    expect(await b.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toEqual({ ok: false, reason: "not found" });
    expect(await stranger.mutation(api.bookings.transition, { bookingId: id, to: "cancelled" })).toEqual({ ok: false, reason: "not found" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("requested");
  });

  test("the customer cannot accept or complete their own booking, but can cancel", async () => {
    const { t, customer, request } = await setup();
    const id = await request();
    expect(await customer.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toMatchObject({ ok: false });
    expect(await customer.mutation(api.bookings.transition, { bookingId: id, to: "completed" })).toMatchObject({ ok: false });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("requested");
    expect(await customer.mutation(api.bookings.transition, { bookingId: id, to: "cancelled" })).toEqual({ ok: true });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("cancelled");
  });

  test("the provider can accept then complete, and each step records who acted", async () => {
    const { t, ownerA, a, request } = await setup();
    const id = await request();
    expect(await a.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toEqual({ ok: true });
    expect(await a.mutation(api.bookings.transition, { bookingId: id, to: "completed" })).toEqual({ ok: true });
    const events = await t.run((ctx) => ctx.db.query("bookingEvents").withIndex("by_booking", (q) => q.eq("bookingId", id)).collect());
    expect(events.map((e) => [e.fromStatus, e.toStatus, e.actorId])).toEqual([
      [undefined, "requested", expect.anything()],
      ["requested", "accepted", ownerA],
      ["accepted", "completed", ownerA],
    ]);
  });

  test("accepting an overlapping booking is refused", async () => {
    const { a, request } = await setup();
    const start = soon();
    const first = await request(undefined, start);
    const second = await request(undefined, start + HOUR);
    expect(await a.mutation(api.bookings.transition, { bookingId: first, to: "accepted" })).toEqual({ ok: true });
    expect(await a.mutation(api.bookings.transition, { bookingId: second, to: "accepted" })).toEqual({
      ok: false, reason: "time conflicts with another accepted booking",
    });
  });
});

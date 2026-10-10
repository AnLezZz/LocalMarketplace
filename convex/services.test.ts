import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

const HOUR = 3_600_000;
const mow = { name: "Lawn mowing", description: "Front and back", priceType: "hourly" as const, priceCents: 5000, durationMinutes: 60 };

async function setup() {
  const t = newT();
  const ownerA = await createUser(t, "provider");
  const ownerB = await createUser(t, "provider");
  const providerA = await createProvider(t, ownerA);
  const providerB = await createProvider(t, ownerB);
  const customerId = await createUser(t, "customer", "cust@example.nz");
  return { t, a: asUser(t, ownerA), b: asUser(t, ownerB), customer: asUser(t, customerId), providerA, providerB };
}

describe("services", () => {
  test("a provider creates, edits, disables and archives their own service", async () => {
    const { a, providerA } = await setup();
    const id = await a.mutation(api.services.create, mow);
    expect(await a.query(api.services.listMine, {})).toMatchObject([{ name: "Lawn mowing", enabled: true, providerId: providerA }]);

    await a.mutation(api.services.update, { id, ...mow, name: "Lawn care", priceType: "fixed", priceCents: 9000 });
    expect(await a.query(api.services.listMine, {})).toMatchObject([{ name: "Lawn care", priceType: "fixed", priceCents: 9000 }]);

    await a.mutation(api.services.setEnabled, { id, enabled: false });
    expect(await a.query(api.services.listForProvider, { providerId: providerA })).toEqual([]);
    await a.mutation(api.services.setEnabled, { id, enabled: true });
    expect(await a.query(api.services.listForProvider, { providerId: providerA })).toHaveLength(1);

    await a.mutation(api.services.archive, { id });
    expect(await a.query(api.services.listMine, {})).toEqual([]);
    expect(await a.query(api.services.listForProvider, { providerId: providerA })).toEqual([]);
  });

  test("another provider and a customer cannot touch it, and learn nothing about it", async () => {
    const { a, b, customer } = await setup();
    const id = await a.mutation(api.services.create, mow);
    for (const who of [b, customer]) {
      await expect(who.mutation(api.services.update, { id, ...mow, name: "Hijack" })).rejects.toThrow(/Service not found|provider profile/);
      await expect(who.mutation(api.services.setEnabled, { id, enabled: false })).rejects.toThrow(/Service not found|provider profile/);
      await expect(who.mutation(api.services.archive, { id })).rejects.toThrow(/Service not found|provider profile/);
    }
    expect(await b.query(api.services.listMine, {})).toEqual([]);
    expect(await a.query(api.services.listMine, {})).toMatchObject([{ name: "Lawn mowing", enabled: true }]);
  });

  test("validates price, duration and quote services", async () => {
    const { a } = await setup();
    await expect(a.mutation(api.services.create, { ...mow, name: " " })).rejects.toThrow("name");
    await expect(a.mutation(api.services.create, { ...mow, priceCents: 50 })).rejects.toThrow("Price");
    await expect(a.mutation(api.services.create, { ...mow, priceCents: undefined })).rejects.toThrow("Price");
    await expect(a.mutation(api.services.create, { ...mow, durationMinutes: 20 })).rejects.toThrow("Duration");
    await expect(a.mutation(api.services.create, { ...mow, durationMinutes: 900 })).rejects.toThrow("Duration");
    const id = await a.mutation(api.services.create, { ...mow, priceType: "quote", priceCents: 1234 });
    expect((await a.query(api.services.listMine, {}))[0]).toMatchObject({ _id: id, priceType: "quote" });
    expect((await a.query(api.services.listMine, {}))[0].priceCents).toBeUndefined();
  });

  test("customers only see enabled services of approved providers", async () => {
    const { t, a, customer, providerA } = await setup();
    await a.mutation(api.services.create, mow);
    expect(await customer.query(api.services.listForProvider, { providerId: providerA })).toHaveLength(1);
    expect(await t.query(api.services.listForProvider, { providerId: providerA })).toHaveLength(1);
    await t.run((ctx) => ctx.db.patch(providerA, { approved: false }));
    expect(await customer.query(api.services.listForProvider, { providerId: providerA })).toEqual([]);
  });

  test("a user without a provider profile cannot create services", async () => {
    const { customer } = await setup();
    await expect(customer.mutation(api.services.create, mow)).rejects.toThrow("provider profile");
  });
});

describe("booking a service", () => {
  test("stores the service and its name; refuses another provider's, disabled or archived ones", async () => {
    const { t, a, b, customer, providerA, providerB } = await setup();
    const sid = await a.mutation(api.services.create, mow);
    const other = await b.mutation(api.services.create, mow);
    const startsAt = Date.now() + 24 * HOUR;
    const book = (providerId: typeof providerA, serviceId?: typeof sid) =>
      customer.mutation(api.bookings.create, { providerId, customerName: "Kiri", description: "d", startsAt, endsAt: startsAt + HOUR, serviceId });

    const id = await book(providerA, sid);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ serviceId: sid, serviceName: "Lawn mowing" });
    await expect(book(providerA, other)).rejects.toThrow("service not found");
    await expect(book(providerB, sid)).rejects.toThrow("service not found");
    await a.mutation(api.services.setEnabled, { id: sid, enabled: false });
    await expect(book(providerA, sid)).rejects.toThrow("service not found");
    await a.mutation(api.services.archive, { id: sid });
    await expect(book(providerA, sid)).rejects.toThrow("service not found");
    // The old booking keeps its name even after the service is archived.
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ serviceName: "Lawn mowing" });
    // Booking without a service still works (providers who have not added any).
    await expect(book(providerA)).resolves.toBeTruthy();
  });
});

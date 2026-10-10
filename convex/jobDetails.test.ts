import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { servesSuburb, validateJob } from "./model/jobDetails";

const HOUR = 3_600_000;
const job = { address: "12 Ponsonby Road", suburb: "Ponsonby" };

async function setup() {
  const t = newT();
  const ownerA = await createUser(t, "provider"), ownerB = await createUser(t, "provider");
  const providerA = await createProvider(t, ownerA, { suburb: "Mount Eden" });
  const providerB = await createProvider(t, ownerB);
  const customerId = await createUser(t, "customer", "kiri@example.nz");
  const customer = asUser(t, customerId), stranger = asUser(t, await createUser(t, "customer"));
  let n = 0;
  const book = (extra: Record<string, unknown> = {}, providerId = providerA) => {
    const startsAt = Date.now() + (24 + 3 * n++) * HOUR;
    return customer.mutation(api.bookings.create, { providerId, customerName: "Kiri", description: "Mow", startsAt, endsAt: startsAt + HOUR, ...job, ...extra } as never);
  };
  return { t, a: asUser(t, ownerA), b: asUser(t, ownerB), customer, stranger, providerA, providerB, book };
}

describe("validateJob / servesSuburb", () => {
  test("normalises and validates the address, notes and phone", () => {
    expect(validateJob({ address: "  12   Ponsonby Rd ", suburb: " Ponsonby ", shareContact: false })).toEqual({ address: "12 Ponsonby Rd", suburb: "Ponsonby", shareContact: false });
    expect(validateJob({ address: "12 Rd St", suburb: "X", accessNotes: " Gate code 1234 ", shareContact: true, phone: "021 123 4567" })).toMatchObject({ accessNotes: "Gate code 1234", customerPhone: "0211234567" });
    expect(() => validateJob({ address: "1", suburb: "X", shareContact: false })).toThrow("street address");
    expect(() => validateJob({ address: "12 Rd St", suburb: " ", shareContact: false })).toThrow("suburb");
    expect(() => validateJob({ address: "12 Rd St", suburb: "X", shareContact: false, phone: "abc" })).toThrow("valid phone");
    expect(() => validateJob({ address: "12 Rd St", suburb: "X", shareContact: true })).toThrow("phone number");
    expect(() => validateJob({ address: "12 Rd St", suburb: "X", accessNotes: "x".repeat(501), shareContact: false })).toThrow("too long");
  });
  test("no list means anywhere; otherwise own suburb plus the list, ignoring case", () => {
    expect(servesSuburb({ suburb: "Mt Eden" }, "Anywhere")).toBe(true);
    expect(servesSuburb({ suburb: "Mt Eden", serviceSuburbs: [] }, "Anywhere")).toBe(true);
    const p = { suburb: "Mt Eden", serviceSuburbs: ["Grey Lynn", "Ponsonby"] };
    expect(servesSuburb(p, " ponsonby ")).toBe(true);
    expect(servesSuburb(p, "mt  eden")).toBe(true);
    expect(servesSuburb(p, "Takapuna")).toBe(false);
  });
});

describe("bookings.create job details and service area", () => {
  test("requires an address and stores it; respects the provider's service area", async () => {
    const { t, a, book, providerA } = await setup();
    const id = await book({ accessNotes: "Side gate", shareContact: true, phone: "021 555 0000" });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ address: "12 Ponsonby Road", suburb: "Ponsonby", accessNotes: "Side gate", shareContact: true, customerPhone: "0215550000" });
    await expect(book({ address: "" })).rejects.toThrow("street address");
    await expect(book({ shareContact: true })).rejects.toThrow("phone number");

    await a.mutation(api.providers.setServiceAreas, { suburbs: [" Grey Lynn ", "Grey Lynn", "Herne Bay"] });
    expect((await t.run((ctx) => ctx.db.get(providerA)))?.serviceSuburbs).toEqual(["Grey Lynn", "Herne Bay"]);
    await expect(book()).rejects.toThrow("doesn't service Ponsonby");
    await expect(book({ suburb: "grey lynn" })).resolves.toBeTruthy();
    await expect(book({ suburb: "Mount Eden" })).resolves.toBeTruthy(); // their own suburb always counts
  });

  test("only the owner sets service areas, with sane limits", async () => {
    const { t, a, customer } = await setup();
    await expect(customer.mutation(api.providers.setServiceAreas, { suburbs: ["X"] })).rejects.toThrow("provider profile");
    await expect(t.mutation(api.providers.setServiceAreas, { suburbs: ["X"] })).rejects.toThrow("Sign in required");
    await expect(a.mutation(api.providers.setServiceAreas, { suburbs: Array.from({ length: 31 }, (_, i) => `S${i}`) })).rejects.toThrow("at most 30");
    await expect(a.mutation(api.providers.setServiceAreas, { suburbs: ["x".repeat(61)] })).rejects.toThrow("too long");
    await a.mutation(api.providers.setServiceAreas, { suburbs: [] });
  });
});

describe("who can see private job details", () => {
  test("a provider sees only the suburb until accepting, then address and notes, and contact only if shared", async () => {
    const { a, b, book } = await setup();
    const shared = await book({ accessNotes: "Gate 1234", shareContact: true, phone: "021 555 0000" });
    const kept = await book({ accessNotes: "Dog inside" });

    let v = await a.query(api.bookings.getForProvider, { id: shared });
    expect(v).toMatchObject({ suburb: "Ponsonby", privateHidden: true });
    expect(v?.address).toBeUndefined(); expect(v?.accessNotes).toBeUndefined(); expect(v?.contact).toBeUndefined();

    await a.mutation(api.bookings.transition, { bookingId: shared, to: "accepted" });
    v = await a.query(api.bookings.getForProvider, { id: shared });
    expect(v).toMatchObject({ address: "12 Ponsonby Road", accessNotes: "Gate 1234", contact: { email: "kiri@example.nz", phone: "0215550000" }, privateHidden: false });

    await a.mutation(api.bookings.transition, { bookingId: kept, to: "accepted" });
    const k = await a.query(api.bookings.getForProvider, { id: kept });
    expect(k).toMatchObject({ address: "12 Ponsonby Road", accessNotes: "Dog inside" });
    expect(k?.contact).toBeUndefined(); // the customer did not opt in

    await a.mutation(api.bookings.transition, { bookingId: shared, to: "cancelled" });
    v = await a.query(api.bookings.getForProvider, { id: shared });
    expect(v?.address).toBeUndefined(); expect(v?.contact).toBeUndefined(); // hidden again once cancelled
    expect(await b.query(api.bookings.getForProvider, { id: kept })).toBeNull();
  });

  test("lists never carry the email, phone, address or notes", async () => {
    const { a, book } = await setup();
    const id = await book({ accessNotes: "Gate", shareContact: true, phone: "021 555 0000" });
    await a.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    const [row] = await a.query(api.bookings.listIncoming, {});
    expect(row).toMatchObject({ _id: id, customerName: "Kiri", suburb: "Ponsonby" });
    for (const key of ["customerEmail", "customerPhone", "address", "accessNotes", "shareContact"]) expect(row).not.toHaveProperty(key);
  });

  test("the customer sees their own booking in full (no email); nobody else does", async () => {
    const { t, a, customer, stranger, book } = await setup();
    const id = await book({ accessNotes: "Gate", shareContact: true, phone: "021 555 0000" });
    const mine = await customer.query(api.bookings.getForCustomer, { id });
    expect(mine).toMatchObject({ address: "12 Ponsonby Road", accessNotes: "Gate", customerPhone: "0215550000", providerName: "Test Provider", status: "requested" });
    expect(mine).not.toHaveProperty("customerEmail");
    expect(mine?.events).toHaveLength(1);
    expect(await a.query(api.bookings.getForCustomer, { id })).toBeNull();
    expect(await stranger.query(api.bookings.getForCustomer, { id })).toBeNull();
    expect(await t.query(api.bookings.getForCustomer, { id })).toBeNull();
    expect(await customer.query(api.bookings.getForCustomer, { id: "nope" })).toBeNull();
  });
});

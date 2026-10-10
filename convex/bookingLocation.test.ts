import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import type { Id } from "./_generated/dataModel";

const HOUR = 3_600_000;
const venue = { name: "Ponsonby Hair Studio", address: "14 Ponsonby Road", suburb: "Ponsonby", notes: "Ring the bell" };
const home = { address: "12 Grey Street", suburb: "Grey Lynn" };

async function setup() {
  const t = newT();
  const ownerId = await createUser(t, "provider"), otherOwnerId = await createUser(t, "provider");
  // Based in Ponsonby and travelling to Mount Eden only: Grey Lynn is OUTSIDE the service area.
  const providerId = await createProvider(t, ownerId, { suburb: "Ponsonby", serviceSuburbs: ["Mount Eden"], category: "cleaning" });
  const otherProviderId = await createProvider(t, otherOwnerId, { suburb: "Ponsonby" });
  const owner = asUser(t, ownerId), otherOwner = asUser(t, otherOwnerId);
  const customer = asUser(t, await createUser(t, "customer", "kiri@example.nz")), stranger = asUser(t, await createUser(t, "customer"));
  const service = (who: typeof owner, extra: Record<string, unknown> = {}) =>
    who.mutation(api.services.create, { name: "Service", description: "", priceType: "fixed", priceCents: 6000, durationMinutes: 60, ...extra } as never);
  let n = 0;
  const book = (serviceId: Id<"services"> | undefined, extra: Record<string, unknown> = {}, providerIdArg = providerId, who = customer) => {
    const startsAt = Date.now() + (24 + 3 * n++) * HOUR;
    return who.mutation(api.bookings.create, { providerId: providerIdArg, customerName: "Kiri", description: "Please", startsAt, endsAt: startsAt + HOUR, serviceId, ...extra } as never);
  };
  return { t, owner, otherOwner, customer, stranger, providerId, otherProviderId, service, book };
}

describe("service location settings", () => {
  test("provider and either need a venue; customer and online carry none; stale fields are dropped", async () => {
    const { owner, service, t } = await setup();
    await expect(service(owner, { locationMode: "provider" })).rejects.toThrow("street address");
    await expect(service(owner, { locationMode: "either", venue: { address: "14 Ponsonby Road" } })).rejects.toThrow("suburb");
    const id = await service(owner, { locationMode: "customer", venue, onlineNote: "x", meetingLink: "https://meet.example.nz/a" });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ locationMode: "customer" });
    expect(row?.venue).toBeUndefined(); expect(row?.meetingLink).toBeUndefined(); expect(row?.onlineNote).toBeUndefined();
    const hair = await t.run(async (ctx) => (await ctx.db.get(await service(owner, { locationMode: "provider", venue })))!);
    expect(hair.venue).toEqual(venue);
  });
  test("a meeting link must be https; the note is bounded", async () => {
    const { owner, service } = await setup();
    await expect(service(owner, { locationMode: "online", meetingLink: "http://meet.example.nz" })).rejects.toThrow("https");
    await expect(service(owner, { locationMode: "online", meetingLink: "javascript:alert(1)" })).rejects.toThrow();
    await expect(service(owner, { locationMode: "online", meetingLink: "not a link" })).rejects.toThrow("web address");
    await expect(service(owner, { locationMode: "online", onlineNote: "x".repeat(201) })).rejects.toThrow("too long");
  });
  test("a category must be active, and saving a service lists the provider under it", async () => {
    const { owner, service, t, providerId } = await setup();
    await t.run(async (ctx) => { await ctx.db.insert("categories", { slug: "hair", label: "Hair", icon: "scissors", hue: "neutral", order: 0, enabled: true }); await ctx.db.insert("categories", { slug: "cleaning", label: "Cleaning", icon: "cleaning", hue: "cleaning", order: 1, enabled: true }); });
    await expect(service(owner, { categorySlug: "nonsense" })).rejects.toThrow("Unknown category");
    await service(owner, { categorySlug: "hair" });
    expect((await t.run((ctx) => ctx.db.get(providerId)))?.categorySlugs).toEqual(["cleaning", "hair"]);
  });
  test("the venue suburb must be one Localo covers when a coverage list exists", async () => {
    const { owner, service, t } = await setup();
    await t.run((ctx) => ctx.db.insert("suburbs", { name: "Ponsonby", key: "ponsonby", enabled: true }));
    await expect(service(owner, { locationMode: "provider", venue: { ...venue, suburb: "Whangarei" } })).rejects.toThrow("don't operate");
    await service(owner, { locationMode: "provider", venue });
  });
  test("only the owner edits their services; the public list never carries the meeting link", async () => {
    const { owner, otherOwner, service, customer, providerId, t } = await setup();
    const id = await service(owner, { locationMode: "online", meetingLink: "https://meet.example.nz/private" });
    await expect(otherOwner.mutation(api.services.update, { id, name: "x", description: "", priceType: "fixed", priceCents: 5000, durationMinutes: 60 } as never)).rejects.toThrow("Service not found");
    const pub = await customer.query(api.services.listForProvider, { providerId });
    expect(JSON.stringify(pub)).not.toContain("meet.example.nz");
    expect(JSON.stringify(await t.query(api.services.listForProvider, { providerId }))).not.toContain("meet.example.nz");
    expect(JSON.stringify(await owner.query(api.services.listMine, {}))).toContain("meet.example.nz"); // the owner's own list does
  });
});

describe("customer-location bookings", () => {
  test("need a real address, which is checked against the provider's service area", async () => {
    const { owner, service, book } = await setup();
    const id = await service(owner, { locationMode: "customer" });
    await expect(book(id, { address: "", suburb: "" })).rejects.toThrow("street address");
    await expect(book(id, { address: "12 Grey Street", suburb: "Grey Lynn" })).rejects.toThrow("doesn't service Grey Lynn");
    await expect(book(id, { address: "1", suburb: "Mount Eden" })).rejects.toThrow("street address");
    await expect(book(id, { address: "5 Mount Eden Road", suburb: "Mount Eden" })).resolves.toBeTruthy();
  });
  test("a service with no mode, and a booking with no service, keep today's behaviour", async () => {
    const { t, owner, customer, book, providerId } = await setup();
    const legacy = await t.run((ctx) => ctx.db.insert("services", { providerId, name: "Old", description: "", priceType: "fixed", priceCents: 5000, durationMinutes: 60, enabled: true, archived: false }));
    await expect(book(legacy, { address: "", suburb: "" })).rejects.toThrow("street address");
    const id = await book(legacy, { address: "5 Mount Eden Road", suburb: "Mount Eden" });
    expect(await customer.query(api.bookings.getForCustomer, { id })).toMatchObject({ locationMode: "customer", address: "5 Mount Eden Road" });
    await expect(book(undefined, { locationChoice: "provider" })).rejects.toThrow("isn't offered there");
    await expect(book(undefined, { address: "5 Mount Eden Road", suburb: "Mount Eden" })).resolves.toBeTruthy();
    void owner;
  });
});

describe("provider-location bookings", () => {
  test("need no customer address, snapshot the venue, and ignore any address that is sent", async () => {
    const { owner, customer, service, book, t } = await setup();
    const id = await service(owner, { locationMode: "provider", venue });
    const bookingId = await book(id, { ...home }); // Grey Lynn is outside the service area: irrelevant when the customer travels
    const row = await t.run((ctx) => ctx.db.get(bookingId));
    expect(row).toMatchObject({ locationMode: "provider", venue });
    expect(row?.address).toBeUndefined(); expect(row?.suburb).toBeUndefined();
    await expect(book(id)).resolves.toBeTruthy(); // and with none at all
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).toMatchObject({ locationMode: "provider", venue });
  });
  test("contact sharing is still validated", async () => {
    const { owner, service, book } = await setup();
    const id = await service(owner, { locationMode: "provider", venue });
    await expect(book(id, { shareContact: true })).rejects.toThrow("phone number");
    await expect(book(id, { phone: "abc" })).rejects.toThrow("valid phone");
    await expect(book(id, { shareContact: true, phone: "021 123 4567" })).resolves.toBeTruthy();
  });
  test("the provider sees the venue straight away, and no customer address was ever collected", async () => {
    const { owner, service, book } = await setup();
    const id = await service(owner, { locationMode: "provider", venue });
    const bookingId = await book(id);
    const seen = await owner.query(api.bookings.getForProvider, { id: bookingId });
    expect(seen).toMatchObject({ locationMode: "provider", venue, privateHidden: false });
    expect(seen?.address).toBeUndefined();
  });
});

describe("online bookings", () => {
  test("need no address and no travel-area check; the note is copied, the link is private until accepted", async () => {
    const { owner, customer, service, book, t } = await setup();
    const id = await service(owner, { locationMode: "online", onlineNote: "Video call", meetingLink: "https://meet.example.nz/room-7" });
    const bookingId = await book(id, { address: "somewhere", suburb: "Whangarei" }); // sent but meaningless: not validated, not stored
    const row = await t.run((ctx) => ctx.db.get(bookingId));
    expect(row).toMatchObject({ locationMode: "online", onlineNote: "Video call" });
    expect(row?.address).toBeUndefined();
    // requested: the customer has no link
    expect(JSON.stringify(await customer.query(api.bookings.getForCustomer, { id: bookingId }))).not.toContain("meet.example.nz");
    expect(JSON.stringify(await customer.query(api.bookings.listMine, {}))).not.toContain("meet.example.nz");
    expect(await owner.query(api.bookings.getForProvider, { id: bookingId })).toMatchObject({ meetingLink: "https://meet.example.nz/room-7" });
    await owner.mutation(api.bookings.transition, { bookingId, to: "accepted" });
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).toMatchObject({ meetingLink: "https://meet.example.nz/room-7" });
  });
});

describe("meeting link added on the booking", () => {
  test("a provider can supply it later; only the owner, only online, only https, only while open; the customer sees it once accepted", async () => {
    const { owner, otherOwner, customer, service, book, t } = await setup();
    const bookingId = await book(await service(owner, { locationMode: "online" })); // the service has no link to copy
    await expect(otherOwner.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "https://meet.example.nz/x" })).rejects.toThrow("booking not found");
    await expect(customer.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "https://meet.example.nz/x" })).rejects.toThrow("booking not found");
    await expect(owner.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "http://meet.example.nz/x" })).rejects.toThrow("https");
    await expect(owner.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "  " })).rejects.toThrow("Enter the meeting link");
    await owner.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "https://meet.example.nz/later" });
    expect(JSON.stringify(await customer.query(api.bookings.getForCustomer, { id: bookingId }))).not.toContain("meet.example.nz"); // still requested
    await owner.mutation(api.bookings.transition, { bookingId, to: "accepted" });
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).toMatchObject({ meetingLink: "https://meet.example.nz/later" });
    await owner.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "https://meet.example.nz/changed" }); // still open when accepted
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).toMatchObject({ meetingLink: "https://meet.example.nz/changed" });
    await owner.mutation(api.bookings.transition, { bookingId, to: "completed" });
    await expect(owner.mutation(api.bookings.setMeetingLink, { bookingId, meetingLink: "https://meet.example.nz/late" })).rejects.toThrow("open");
    const atVenue = await book(await service(owner, { locationMode: "provider", venue }));
    await expect(owner.mutation(api.bookings.setMeetingLink, { bookingId: atVenue, meetingLink: "https://meet.example.nz/x" })).rejects.toThrow("online");
    expect((await t.run((ctx) => ctx.db.get(atVenue)))?.meetingLink).toBeUndefined();
  });
});

describe('"either" services', () => {
  test("the customer chooses, and each choice follows its own rules", async () => {
    const { owner, service, book, t } = await setup();
    const id = await service(owner, { locationMode: "either", venue });
    await expect(book(id, { ...home })).rejects.toThrow("Choose where");
    const atVenue = await book(id, { locationChoice: "provider" });
    expect(await t.run((ctx) => ctx.db.get(atVenue))).toMatchObject({ locationMode: "provider", venue });
    await expect(book(id, { locationChoice: "customer", address: "", suburb: "" })).rejects.toThrow("street address");
    await expect(book(id, { locationChoice: "customer", ...home })).rejects.toThrow("doesn't service Grey Lynn");
    const atHome = await book(id, { locationChoice: "customer", address: "5 Mount Eden Road", suburb: "Mount Eden" });
    expect(await t.run((ctx) => ctx.db.get(atHome))).toMatchObject({ locationMode: "customer", address: "5 Mount Eden Road" });
  });
  test("an online choice, or anything else, for a service that is not online is refused", async () => {
    const { owner, service, book } = await setup();
    const either = await service(owner, { locationMode: "either", venue });
    await expect(book(either, { locationChoice: "online" })).rejects.toThrow("Choose where");
    const fixedHome = await service(owner, { locationMode: "customer" });
    await expect(book(fixedHome, { locationChoice: "provider", ...home })).rejects.toThrow("isn't offered there");
    const fixedVenue = await service(owner, { locationMode: "provider", venue });
    await expect(book(fixedVenue, { locationChoice: "customer", address: "5 Mount Eden Road", suburb: "Mount Eden" })).rejects.toThrow("isn't offered there");
    const online = await service(owner, { locationMode: "online" });
    await expect(book(online, { locationChoice: "provider" })).rejects.toThrow("isn't offered there");
    await expect(book(online, { locationChoice: "bogus" })).rejects.toThrow();
  });
});

describe("snapshots and history", () => {
  test("editing the service afterwards never rewrites a booking", async () => {
    const { owner, customer, service, book, t } = await setup();
    const id = await service(owner, { name: "Haircut", locationMode: "provider", venue, priceCents: 6000 });
    const bookingId = await book(id);
    await owner.mutation(api.services.update, { id, name: "Premium cut", description: "", priceType: "fixed", priceCents: 9000, durationMinutes: 60, locationMode: "online", meetingLink: "https://meet.example.nz/x" } as never);
    const row = await t.run((ctx) => ctx.db.get(bookingId));
    expect(row).toMatchObject({ serviceName: "Haircut", locationMode: "provider", venue, unitCents: 6000, estimateCents: 6000 });
    expect(row?.meetingLink).toBeUndefined();
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).toMatchObject({ serviceName: "Haircut", locationMode: "provider", venue });
    await owner.mutation(api.services.archive, { id });
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).toMatchObject({ serviceName: "Haircut" });
  });
});

describe("isolation and rules that must not change", () => {
  test("other customers and other providers cannot read or touch a booking, whatever its location", async () => {
    const { owner, otherOwner, customer, stranger, service, book } = await setup();
    const id = await service(owner, { locationMode: "provider", venue });
    const bookingId = await book(id);
    expect(await stranger.query(api.bookings.getForCustomer, { id: bookingId })).toBeNull();
    expect(await otherOwner.query(api.bookings.getForProvider, { id: bookingId })).toBeNull();
    expect(await stranger.mutation(api.bookings.transition, { bookingId, to: "cancelled" })).toMatchObject({ ok: false });
    expect(await otherOwner.mutation(api.bookings.transition, { bookingId, to: "accepted" })).toMatchObject({ ok: false });
    expect(await customer.query(api.bookings.getForCustomer, { id: bookingId })).not.toBeNull();
  });
  test("a service of another provider cannot be booked through this one, and only approved providers take requests", async () => {
    const { otherOwner, service, book, otherProviderId, providerId, t } = await setup();
    const theirs = await service(otherOwner, { locationMode: "provider", venue });
    await expect(book(theirs)).rejects.toThrow("service not found");
    await t.run((ctx) => ctx.db.patch(providerId, { approved: false }));
    await expect(book(undefined, { address: "5 Mount Eden Road", suburb: "Mount Eden" })).rejects.toThrow("provider not found");
    void otherProviderId;
  });
  test("pending requests do not reserve the slot; acceptance never double-books, for any location", async () => {
    const { owner, service, customer, t } = await setup();
    const venueService = await service(owner, { locationMode: "provider", venue });
    const onlineService = await service(owner, { locationMode: "online" });
    const startsAt = Date.now() + 48 * HOUR;
    const provider = (await t.run((ctx) => ctx.db.query("providers").first()))!;
    const create = (serviceId: Id<"services">, offset: number) => customer.mutation(api.bookings.create, { providerId: provider._id, customerName: "Kiri", description: "x", startsAt: startsAt + offset, endsAt: startsAt + offset + HOUR, serviceId } as never);
    const first = await create(venueService, 0);
    const second = await create(onlineService, 30 * 60_000); // overlaps the first: both may be requested
    expect(await owner.mutation(api.bookings.transition, { bookingId: first, to: "accepted" })).toEqual({ ok: true });
    expect(await owner.mutation(api.bookings.transition, { bookingId: second, to: "accepted" })).toMatchObject({ ok: false, reason: "time conflicts with another accepted booking" });
    // concurrent attempts at the same moment: exactly one wins
    const a = await create(venueService, 5 * HOUR), b = await create(onlineService, 5 * HOUR + 15 * 60_000);
    const results = await Promise.all([owner.mutation(api.bookings.transition, { bookingId: a, to: "accepted" }), owner.mutation(api.bookings.transition, { bookingId: b, to: "accepted" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

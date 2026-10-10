import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT, type T } from "../test-utils/harness";
import type { Id } from "./_generated/dataModel";

const DAY = 86_400_000;
type Status = "requested" | "accepted" | "declined" | "cancelled" | "completed";

async function world() {
  const t = newT();
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { approved: true });
  const otherProvider = await createProvider(t, await createUser(t, "provider"), { approved: true });
  const add = (pid: Id<"providers">, status: Status, startsAt: number, name = "Sarah") =>
    t.run((ctx) => ctx.db.insert("bookings", { providerId: pid, customerName: name, customerEmail: "x@example.nz", description: "job", startsAt, endsAt: startsAt + 3_600_000, status }));
  return { t, owner: asUser(t, ownerId), customer: asUser(t, await createUser(t, "customer")), providerId, otherProvider, add };
}
const ASOF = Date.now();
const page = (q: ReturnType<typeof asUser>, tab: "pending" | "upcoming" | "history" | "all", cursor: string | null = null, numItems = 50) =>
  q.query(api.bookings.providerPage, { tab, paginationOpts: { numItems, cursor }, asOf: ASOF });

/** Walks every page of a tab and returns the ids in order. */
async function walk(q: ReturnType<typeof asUser>, tab: "pending" | "upcoming" | "history" | "all", numItems = 50) {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 40; i++) {
    const r = await page(q, tab, cursor, numItems);
    ids.push(...r.page.map((b) => b._id));
    if (r.isDone) return ids;
    cursor = r.continueCursor;
  }
  throw new Error("never finished");
}

describe("more than 50 bookings, and old ones that are still open", () => {
  async function busy(t: T, add: Awaited<ReturnType<typeof world>>["add"], providerId: Id<"providers">) {
    const now = Date.now();
    // Created FIRST, so 250 newer rows push them past the newest-200 window a plain list would read.
    const oldPending = await add(providerId, "requested", now + 3 * DAY, "Old request");
    const oldUpcoming = await add(providerId, "accepted", now + 20 * DAY, "Old accepted");
    for (let i = 0; i < 250; i++) await add(providerId, "completed", now - (i + 2) * DAY, `Done ${i}`);
    return { oldPending, oldUpcoming, now };
  }

  test("pending and upcoming always include an old open booking; history pages through all 250 without repeats", async () => {
    const { t, owner, providerId, add } = await world();
    const { oldPending, oldUpcoming } = await busy(t, add, providerId);
    expect(await walk(owner, "pending")).toEqual([oldPending]);
    expect(await walk(owner, "upcoming")).toEqual([oldUpcoming]);
    const history = await walk(owner, "history");
    expect(history).toHaveLength(250);
    expect(new Set(history).size).toBe(250);
    expect(history).not.toContain(oldPending);
    expect(history).not.toContain(oldUpcoming);
    expect(await walk(owner, "all")).toHaveLength(252);
  });
  test("the small legacy list really would have lost them (the reason for the new queries)", async () => {
    const { t, owner, providerId, add } = await world();
    const { oldPending } = await busy(t, add, providerId);
    expect((await owner.query(api.bookings.listIncoming, {})).map((b) => b._id)).not.toContain(oldPending);
  });
  test("summary counts are exact and separate from any list; a page never holds more than 50", async () => {
    const { t, owner, providerId, add } = await world();
    await busy(t, add, providerId);
    await add(providerId, "declined", Date.now() - DAY); await add(providerId, "cancelled", Date.now() - DAY);
    await add(providerId, "accepted", Date.now() - 5 * DAY); // accepted, already over: history
    expect(await owner.query(api.bookings.providerSummary, { asOf: Date.now() })).toMatchObject({ pending: 1, upcoming: 1, completed: 250, history: 253, all: 255, capped: false });
    expect((await page(owner, "all", null, 500)).page).toHaveLength(50);
  });
  test("counts stop at the cap and say so", async () => {
    const { t, owner, providerId, add } = await world();
    await t.run(async (ctx) => { for (let i = 0; i < 1005; i++) await ctx.db.insert("bookings", { providerId, customerName: "x", customerEmail: "x@example.nz", description: "j", startsAt: i, endsAt: i + 1, status: "completed" }); });
    const s = await owner.query(api.bookings.providerSummary, { asOf: Date.now() });
    expect(s).toMatchObject({ completed: 1000, cap: 1000, capped: true });
    void add;
  });
  test("only the provider's own bookings; customers and signed-out callers get nothing", async () => {
    const { t, owner, customer, providerId, otherProvider, add } = await world();
    await add(providerId, "requested", Date.now() + DAY);
    await add(otherProvider, "requested", Date.now() + DAY);
    expect(await walk(owner, "pending")).toHaveLength(1);
    expect((await page(customer, "pending")).page).toEqual([]);
    expect(await t.query(api.bookings.providerPage, { tab: "pending", paginationOpts: { numItems: 5, cursor: null }, asOf: Date.now() })).toMatchObject({ page: [] });
    expect(await customer.query(api.bookings.providerSummary, { asOf: Date.now() })).toBeNull();
  });
});

describe("calendar range", () => {
  test("returns what starts in [from, to), not declined or cancelled, nothing of other providers; early and late jobs included", async () => {
    const { t, owner, customer, providerId, otherProvider, add } = await world();
    const from = Date.UTC(2026, 9, 11, 11, 0); // Mon 12 Oct 2026 00:00 NZDT
    const to = from + 7 * DAY;
    const early = await add(providerId, "accepted", from + 5 * 3_600_000 + 30 * 60_000); // 05:30
    const late = await add(providerId, "accepted", to - 30 * 60_000); // Sun 23:30
    const justBefore = await add(providerId, "accepted", from - 60_000);
    const atEnd = await add(providerId, "accepted", to);
    await add(providerId, "declined", from + DAY); await add(providerId, "cancelled", from + DAY);
    await add(otherProvider, "accepted", from + DAY);
    const ids = (await owner.query(api.bookings.providerRange, { from, to })).map((b) => b._id);
    expect(ids.sort()).toEqual([early, late].sort());
    expect(ids).not.toContain(justBefore); expect(ids).not.toContain(atEnd);
    expect(await customer.query(api.bookings.providerRange, { from, to })).toEqual([]);
    expect(await owner.query(api.bookings.providerRange, { from, to: from + 90 * DAY })).toEqual([]); // absurd ranges are refused
    void t;
  });
});

describe("reviews page", () => {
  test("pages through the provider's reviews, newest first, without hidden ones", async () => {
    const { t, owner, providerId } = await world();
    const customerId = await createUser(t, "customer");
    const bookingId = await t.run((ctx) => ctx.db.insert("bookings", { providerId, customerName: "x", customerEmail: "x@example.nz", description: "j", startsAt: 1, endsAt: 2, status: "completed" }));
    await t.run(async (ctx) => { for (let i = 0; i < 60; i++) await ctx.db.insert("reviews", { bookingId, providerId, customerId, customerName: `R${i}`, rating: 5, text: "", ...(i % 10 === 0 ? { hidden: true } : {}) }); });
    const names: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const r: { page: { customerName: string }[]; isDone: boolean; continueCursor: string } = await owner.query(api.reviews.minePage, { paginationOpts: { numItems: 25, cursor } });
      names.push(...r.page.map((x) => x.customerName));
      if (r.isDone) break; cursor = r.continueCursor;
    }
    expect(names).toHaveLength(54);
    expect(names[0]).toBe("R59");
    expect(names).not.toContain("R10");
  });
});

describe("old notification links", () => {
  test("links stored before the dashboard was split point at the pages that exist now", async () => {
    const { t, owner } = await world();
    const userId = (await t.run((ctx) => ctx.db.query("users").first()))!._id;
    void userId;
    // the owner of `world()` is the first provider user: find them through the provider
    const provider = (await t.run((ctx) => ctx.db.query("providers").first()))!;
    for (const href of ["/provider#reviews", "/provider#bookings", "/provider#calendar", "/provider/bookings/abc"]) {
      await t.run((ctx) => ctx.db.insert("notifications", { userId: provider.userId!, kind: "x", title: href, body: "b", href, read: false }));
    }
    const got = Object.fromEntries((await owner.query(api.notifications.mine, {})).map((n) => [n.title, n.href]));
    expect(got).toEqual({ "/provider#reviews": "/provider/reviews", "/provider#bookings": "/provider/bookings", "/provider#calendar": "/provider/calendar", "/provider/bookings/abc": "/provider/bookings/abc" });
  });
});

describe("a walk through pages keeps one 'now'", () => {
  test("the time given as asOf, not the clock at each request, decides what counts as upcoming or history", async () => {
    const { owner, providerId, add } = await world();
    const now = Date.now();
    const job = await add(providerId, "accepted", now - 3 * DAY); // over, as of today
    const ids = async (tab: "upcoming" | "history", at: number) =>
      (await owner.query(api.bookings.providerPage, { tab, paginationOpts: { numItems: 10, cursor: null }, asOf: at })).page.map((b) => b._id);
    expect(await ids("history", now)).toContain(job);
    expect(await ids("upcoming", now)).not.toContain(job);
    // judged as of four days ago (before it happened) the same booking is upcoming: the walk's one asOf is what keeps pages consistent
    expect(await ids("upcoming", now - 4 * DAY)).toContain(job);
    expect(await ids("history", now - 4 * DAY)).not.toContain(job);
  });
});

describe("the live pulse a provider's dashboard listens to", () => {
  test("changes when this provider's bookings change, and only then", async () => {
    const { t, owner, customer, providerId, otherProvider, add } = await world();
    const pulse = () => owner.query(api.bookings.providerPulse, {});
    const empty = await pulse();
    const id = await add(providerId, "requested", Date.now() + 3 * DAY);
    const requested = await pulse();
    expect(requested).not.toBe(empty);
    await add(otherProvider, "requested", Date.now() + 3 * DAY); // someone else's request
    expect(await pulse()).toBe(requested);
    await t.run((ctx) => ctx.db.patch(id, { startsAt: Date.now() + 4 * DAY, endsAt: Date.now() + 4 * DAY + 3_600_000 })); // a moved time
    const moved = await pulse();
    expect(moved).not.toBe(requested);
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    const accepted = await pulse();
    expect(accepted).not.toBe(moved);
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "completed" });
    expect(await pulse()).not.toBe(accepted);
    expect(await pulse()).not.toContain("Sarah"); // a fingerprint, no booking details
    expect(await customer.query(api.bookings.providerPulse, {})).toBeNull(); // not a provider
    expect(await t.query(api.bookings.providerPulse, {})).toBeNull(); // signed out
  });
});

describe("the live pulse a customer's pages listen to", () => {
  test("changes when their own bookings change (and a notification arrives), not for anyone else's", async () => {
    const { t, owner, providerId, add } = await world();
    const customerId = await createUser(t, "customer", "kiri@example.nz");
    const customer = asUser(t, customerId), stranger = asUser(t, await createUser(t, "customer"));
    const pulse = (who: typeof customer) => who.query(api.bookings.customerPulse, {});
    const empty = await pulse(customer);
    const id = await t.run((ctx) => ctx.db.insert("bookings", { providerId, customerId, customerName: "Kiri", customerEmail: "kiri@example.nz", description: "job", startsAt: Date.now() + 3 * DAY, endsAt: Date.now() + 3 * DAY + 3_600_000, status: "requested" }));
    const requested = await pulse(customer);
    expect(requested).not.toBe(empty);
    await add(providerId, "requested", Date.now() + 5 * DAY); // someone else's booking
    expect(await pulse(customer)).toBe(requested);
    expect(await pulse(stranger)).toBe(empty);
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    const accepted = await pulse(customer);
    expect(accepted).not.toBe(requested);
    expect(accepted).not.toContain("Kiri");
    expect(await t.query(api.bookings.customerPulse, {})).toBeNull();
  });
});

describe("a customer's bookings, by tab", () => {
  async function customerWorld() {
    const { t, providerId } = await world();
    const customerId = await createUser(t, "customer", "kiri@example.nz");
    const customer = asUser(t, customerId), stranger = asUser(t, await createUser(t, "customer"));
    const now = Date.now(), asOf = now;
    const add = (status: Status, startsAt: number) => t.run((ctx) => ctx.db.insert("bookings", { providerId, customerId, customerName: "Kiri", customerEmail: "kiri@example.nz", description: "job", startsAt, endsAt: startsAt + 3_600_000, status }));
    return { t, customer, stranger, add, now, asOf };
  }
  const read = (c: ReturnType<typeof asUser>, tab: string, asOf: number, cursor: string | null, numItems = 4) => c.query(api.bookings.customerPage, { tab, paginationOpts: { numItems, cursor }, asOf });
  async function walkTab(c: ReturnType<typeof asUser>, tab: string, asOf: number, numItems = 4) {
    const ids: string[] = []; let cursor: string | null = null;
    for (let i = 0; i < 40; i++) { const r = await read(c, tab, asOf, cursor, numItems); ids.push(...r.page.map((b) => b._id)); if (r.isDone) return ids; cursor = r.continueCursor; }
    throw new Error("never finished");
  }

  test("every booking lands in exactly one tab, however many there are, and the counts agree", async () => {
    const { customer, add, now, asOf } = await customerWorld();
    const upcoming = [], past = [], cancelled = [];
    for (let i = 0; i < 11; i++) upcoming.push(await add(i % 2 ? "requested" : "accepted", now + (i + 1) * DAY));
    for (let i = 0; i < 9; i++) past.push(await add("completed", now - (i + 1) * DAY));
    past.push(await add("accepted", now - 40 * DAY)); // never finished, now over: history, not upcoming
    for (let i = 0; i < 6; i++) cancelled.push(await add(i % 2 ? "cancelled" : "declined", now + i * DAY));
    expect((await walkTab(customer, "upcoming", asOf)).sort()).toEqual([...upcoming].sort());
    expect((await walkTab(customer, "past", asOf)).sort()).toEqual([...past].sort());
    expect((await walkTab(customer, "cancelled", asOf)).sort()).toEqual([...cancelled].sort());
    expect((await read(customer, "upcoming", asOf, null)).page).toHaveLength(4); // full pages
    expect(await customer.query(api.bookings.customerCounts, { asOf })).toEqual({ upcoming: 11, past: 10, cancelled: 6, capped: false });
    expect((await read(customer, "nonsense", asOf, null, 50)).page).toHaveLength(11); // an unknown tab is the default one
  });

  test("a page says which completed bookings were reviewed, and nobody sees someone else's bookings", async () => {
    const { t, customer, stranger, add, now, asOf } = await customerWorld();
    const reviewed = await add("completed", now - DAY), plain = await add("completed", now - 2 * DAY);
    const [{ providerId, customerId }] = await t.run((ctx) => ctx.db.query("bookings").take(1));
    await t.run((ctx) => ctx.db.insert("reviews", { bookingId: reviewed, providerId, customerId, customerName: "Kiri", rating: 4, text: "good" } as never));
    const page = (await read(customer, "past", asOf, null, 10)).page;
    expect(page.find((b) => b._id === reviewed)?.reviewRating).toBe(4);
    expect(page.find((b) => b._id === plain)?.reviewRating).toBeUndefined();
    expect(await customer.query(api.reviews.forBooking, { bookingId: reviewed })).toEqual({ rating: 4 });
    expect(await customer.query(api.reviews.forBooking, { bookingId: plain })).toBeNull();
    expect(await stranger.query(api.reviews.forBooking, { bookingId: reviewed })).toBeNull();
    expect((await read(stranger, "past", asOf, null, 10)).page).toEqual([]);
    expect(await stranger.query(api.bookings.customerCounts, { asOf })).toEqual({ upcoming: 0, past: 0, cancelled: 0, capped: false });
    expect(await t.query(api.bookings.customerCounts, { asOf })).toBeNull();
  });
});

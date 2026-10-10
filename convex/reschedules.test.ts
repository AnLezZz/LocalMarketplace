import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { localToUtc, addDays, utcToLocal } from "./model/availability";

const HOUR = 3_600_000;
const todayLocal = () => utcToLocal(Date.now()).date;
const at = (daysAhead: number, hour: number, minute = 0) => localToUtc(addDays(todayLocal(), daysAhead), hour * 60 + minute);

async function world() {
  const t = newT();
  const ownerId = await createUser(t, "provider", "fern@example.nz");
  const providerId = await createProvider(t, ownerId, { name: "Fern Gardens" });
  const customerId = await createUser(t, "customer", "kiri@example.nz");
  await t.run((ctx) => ctx.db.patch(customerId, { name: "Kiri" }));
  const owner = asUser(t, ownerId), customer = asUser(t, customerId), stranger = asUser(t, await createUser(t, "customer"));
  const other = asUser(t, await createUser(t, "customer"));
  /** An accepted 2h booking starting `daysAhead` days from now at `hour`. */
  const accepted = async (daysAhead = 3, hour = 10, who = customer) => {
    const startsAt = at(daysAhead, hour);
    const id = await who.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "Kiri", description: "Mow", startsAt, endsAt: startsAt + 2 * HOUR });
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    return id;
  };
  const get = (id: any): Promise<any> => t.run((ctx) => ctx.db.get(id));
  const kinds = async (u: typeof owner) => (await u.query(api.notifications.mine, {})).map((n) => n.kind);
  return { t, owner, customer, stranger, other, providerId, customerId, ownerId, accepted, get, kinds };
}

describe("propose", () => {
  test("either side can propose a new time; the duration is kept and the other side is told", async () => {
    const { owner, customer, accepted, kinds, t } = await world();
    const id = await accepted();
    const r1 = await customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 13), note: "  Work meeting  " });
    expect(await t.run((ctx) => ctx.db.get(r1))).toMatchObject({ proposedBy: "customer", newStartsAt: at(4, 13), newEndsAt: at(4, 13) + 2 * HOUR, note: "Work meeting", status: "pending" });
    expect((await kinds(owner))[0]).toBe("reschedule_requested");
    await customer.mutation(api.reschedules.withdraw, { requestId: r1 });
    await owner.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(5, 9) });
    expect((await kinds(customer))[0]).toBe("reschedule_requested");
  });

  test("only an accepted, future booking can move; times must be in the future and different", async () => {
    const { owner, customer, stranger, accepted, t, providerId } = await world();
    const startsAt = at(3, 10);
    const pending = await customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "K", description: "d", startsAt, endsAt: startsAt + HOUR });
    await expect(customer.mutation(api.reschedules.propose, { bookingId: pending, newStartsAt: at(4, 10) })).rejects.toThrow("accepted booking");
    const id = await accepted(5, 10);
    await expect(customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: Date.now() - HOUR })).rejects.toThrow("future");
    await expect(customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(5, 10) })).rejects.toThrow("already has");
    await expect(customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(6, 10), note: "x".repeat(301) })).rejects.toThrow("too long");
    await expect(stranger.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(6, 10) })).rejects.toThrow("booking not found");
    await expect(t.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(6, 10) })).rejects.toThrow("Sign in required");
    await t.run((ctx) => ctx.db.patch(id, { startsAt: Date.now() - HOUR, endsAt: Date.now() + HOUR }));
    await expect(owner.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(6, 10) })).rejects.toThrow("already started");
  });

  test("one pending request at a time", async () => {
    const { customer, owner, accepted } = await world();
    const id = await accepted();
    await customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 9) });
    await expect(customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(5, 9) })).rejects.toThrow("already a pending");
    await expect(owner.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(5, 9) })).rejects.toThrow("already a pending");
  });

  test("the new time must be available: hours, blocks and other accepted bookings, but not the booking itself", async () => {
    const { t, owner, customer, other, accepted } = await world();
    const mine = await accepted(3, 10);
    await accepted(3, 14, other); // someone else holds 14:00-16:00
    await owner.mutation(api.availability.addTimeOff, { startsAt: at(4, 12), endsAt: at(4, 13) });
    const ask = (start: number) => customer.mutation(api.reschedules.propose, { bookingId: mine, newStartsAt: start });
    await expect(ask(at(3, 15))).rejects.toThrow("isn't available"); // overlaps the other booking
    await expect(ask(at(4, 11, 30))).rejects.toThrow("isn't available"); // runs into the block
    const id = await ask(at(3, 10, 30)); // overlaps only its own current slot
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: "pending" });
    await customer.mutation(api.reschedules.withdraw, { requestId: id });
    await owner.mutation(api.availability.setHours, { hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, enabled: true, startMinute: 9 * 60, endMinute: 17 * 60 })) });
    await expect(ask(at(4, 16))).rejects.toThrow("isn't available"); // 16-18 runs past closing
  });

  test("a suspended provider cannot propose", async () => {
    const { t, owner, accepted, providerId } = await world();
    const id = await accepted();
    await t.run((ctx) => ctx.db.patch(providerId, { approved: false, suspendedAt: Date.now() }));
    await expect(owner.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 9) })).rejects.toThrow(/suspended|not currently active/);
  });
});

describe("respond", () => {
  test("accepting moves the booking, records an event, resets the reminder and tells the proposer", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, accepted, get, kinds } = await world();
    const id = await accepted(3, 10);
    await t.run((ctx) => ctx.db.patch(id, { reminderSentAt: Date.now() }));
    const req = await customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 13) });
    await expect(customer.mutation(api.reschedules.respond, { requestId: req, accept: true })).rejects.toThrow("other side");
    expect(await owner.mutation(api.reschedules.respond, { requestId: req, accept: true })).toEqual({ ok: true });
    expect(await get(id)).toMatchObject({ startsAt: at(4, 13), endsAt: at(4, 13) + 2 * HOUR, status: "accepted" });
    expect((await get(id))?.reminderSentAt).toBeUndefined();
    expect((await get(req))?.status).toBe("accepted");
    expect((await customer.query(api.bookings.getForCustomer, { id }))?.events.at(-1)).toMatchObject({ to: "rescheduled" });
    expect((await kinds(customer))[0]).toBe("reschedule_accepted");
    await expect(owner.mutation(api.reschedules.respond, { requestId: req, accept: true })).rejects.toThrow("already been answered");
    vi.useRealTimers();
  });

  test("declining changes nothing and tells the proposer", async () => {
    const { owner, customer, accepted, get, kinds } = await world();
    const id = await accepted(3, 10);
    const req = await owner.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 13) });
    await customer.mutation(api.reschedules.respond, { requestId: req, accept: false });
    expect(await get(id)).toMatchObject({ startsAt: at(3, 10) });
    expect((await get(req))?.status).toBe("declined");
    expect((await kinds(owner))[0]).toBe("reschedule_declined");
    await expect(customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(5, 9) })).resolves.toBeTruthy(); // can try again
  });

  test("accepting fails, without moving anything, if the time was taken in the meantime", async () => {
    const { owner, customer, other, accepted, get } = await world();
    const mine = await accepted(3, 10);
    const req = await customer.mutation(api.reschedules.propose, { bookingId: mine, newStartsAt: at(4, 10) });
    await accepted(4, 9, other); // 9-11 on day 4 gets booked and accepted first
    expect(await owner.mutation(api.reschedules.respond, { requestId: req, accept: true })).toEqual({ ok: false, reason: expect.stringContaining("no longer available") });
    expect(await get(mine)).toMatchObject({ startsAt: at(3, 10) });
    expect((await get(req))?.status).toBe("pending");
  });

  test("strangers, other bookings' participants and signed-out callers cannot answer", async () => {
    const { t, customer, stranger, accepted } = await world();
    const id = await accepted();
    const req = await customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 9) });
    await expect(stranger.mutation(api.reschedules.respond, { requestId: req, accept: true })).rejects.toThrow("booking not found");
    await expect(t.mutation(api.reschedules.respond, { requestId: req, accept: true })).rejects.toThrow("Sign in required");
  });
});

describe("withdraw and booking changes", () => {
  test("only the proposer can withdraw, once; the other side is told", async () => {
    const { owner, customer, accepted, get, kinds } = await world();
    const id = await accepted();
    const req = await customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 9) });
    await expect(owner.mutation(api.reschedules.withdraw, { requestId: req })).rejects.toThrow("request not found");
    await customer.mutation(api.reschedules.withdraw, { requestId: req });
    expect((await get(req))?.status).toBe("withdrawn");
    expect((await kinds(owner))[0]).toBe("reschedule_withdrawn");
    await expect(customer.mutation(api.reschedules.withdraw, { requestId: req })).rejects.toThrow("already been answered");
    await expect(owner.mutation(api.reschedules.respond, { requestId: req, accept: true })).rejects.toThrow("already been answered");
  });

  test("cancelling or completing the booking withdraws an open request", async () => {
    const { owner, customer, accepted, get } = await world();
    const a = await accepted(3, 10), b = await accepted(4, 10);
    const ra = await customer.mutation(api.reschedules.propose, { bookingId: a, newStartsAt: at(5, 9) });
    const rb = await customer.mutation(api.reschedules.propose, { bookingId: b, newStartsAt: at(6, 9) });
    await customer.mutation(api.bookings.transition, { bookingId: a, to: "cancelled" });
    await owner.mutation(api.bookings.transition, { bookingId: b, to: "completed" });
    expect((await get(ra))?.status).toBe("withdrawn");
    expect((await get(rb))?.status).toBe("withdrawn");
  });

  test("the latest request shows on both detail queries; the new time holds the slot for others", async () => {
    const { owner, customer, other, accepted } = await world();
    const id = await accepted(3, 10);
    const req = await owner.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(4, 9) });
    expect(await customer.query(api.bookings.getForCustomer, { id })).toMatchObject({ reschedule: { status: "pending", proposedBy: "provider", newStartsAt: at(4, 9) } });
    expect(await owner.query(api.bookings.getForProvider, { id })).toMatchObject({ reschedule: { _id: req, status: "pending" } });
    await customer.mutation(api.reschedules.respond, { requestId: req, accept: true });
    // the new slot is now taken, the old one is free
    await expect(accepted(4, 10, other)).rejects.toThrow("isn't available");
    await expect(accepted(3, 10, other)).resolves.toBeTruthy();
  });

  test("a rescheduled booking gets a fresh reminder at its new time", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, accepted } = await world();
    const id = await accepted(3, 10);
    await t.run((ctx) => ctx.db.patch(id, { startsAt: Date.now() + 20 * HOUR, endsAt: Date.now() + 22 * HOUR }));
    expect(await t.mutation(internal.reminders.sendDue, {})).toBe(1);
    const req = await customer.mutation(api.reschedules.propose, { bookingId: id, newStartsAt: at(3, 15) });
    await owner.mutation(api.reschedules.respond, { requestId: req, accept: true });
    await t.run((ctx) => ctx.db.patch(id, { startsAt: Date.now() + 10 * HOUR, endsAt: Date.now() + 12 * HOUR }));
    expect(await t.mutation(internal.reminders.sendDue, {})).toBe(1); // sent again because the time changed
    vi.useRealTimers();
  });
});

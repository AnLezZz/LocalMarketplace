import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { addDays, localToUtc, utcToLocal, weekdayOf } from "./model/availability";

const HOUR = 3_600_000;
const todayLocal = () => utcToLocal(Date.now()).date;
const hours = (over: Record<number, object> = {}) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, enabled: true, startMinute: 9 * 60, endMinute: 17 * 60, ...(over[weekday] ?? {}) }));

async function setup() {
  const t = newT();
  const ownerA = await createUser(t, "provider");
  const ownerB = await createUser(t, "provider");
  const providerA = await createProvider(t, ownerA);
  const customerId = await createUser(t, "customer", "cust@example.nz");
  return { t, a: asUser(t, ownerA), b: asUser(t, ownerB), customer: asUser(t, customerId), providerA };
}
/** A future date (>= 3 days ahead) falling on the given weekday. */
function nextWeekday(weekday: number) {
  let d = addDays(todayLocal(), 3);
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

describe("Auckland time helpers", () => {
  test("round-trip, including either side of daylight saving", () => {
    for (const date of ["2026-01-15", "2026-07-01", "2026-09-27", "2026-04-05"]) {
      expect(utcToLocal(localToUtc(date, 600))).toEqual({ date, minute: 600 });
    }
    expect(localToUtc("2026-01-15", 0)).toBe(Date.parse("2026-01-14T11:00:00Z")); // NZDT +13
    expect(localToUtc("2026-07-01", 0)).toBe(Date.parse("2026-06-30T12:00:00Z")); // NZST +12
  });
});

describe("weekly hours", () => {
  test("owner sets hours; stranger sees nothing; validation rejects bad input", async () => {
    const { a, b } = await setup();
    expect((await a.query(api.availability.mine, {}))?.configured).toBe(false);
    await a.mutation(api.availability.setHours, { hours: hours({ 0: { enabled: false }, 3: { breakStartMinute: 12 * 60, breakEndMinute: 13 * 60 } }) });
    const mine = await a.query(api.availability.mine, {});
    expect(mine?.configured).toBe(true);
    expect(mine?.hours).toHaveLength(7);
    expect(mine?.hours[3]).toMatchObject({ breakStartMinute: 720, breakEndMinute: 780 });
    expect(await b.query(api.availability.mine, {})).toBeNull();
    await expect(a.mutation(api.availability.setHours, { hours: hours().slice(0, 6) })).rejects.toThrow("seven days");
    await expect(a.mutation(api.availability.setHours, { hours: hours({ 1: { endMinute: 8 * 60 } }) })).rejects.toThrow("after opening");
    await expect(a.mutation(api.availability.setHours, { hours: hours({ 1: { startMinute: 100 } }) })).rejects.toThrow("15 minute");
    await expect(a.mutation(api.availability.setHours, { hours: hours({ 1: { breakStartMinute: 7 * 60, breakEndMinute: 8 * 60 } }) })).rejects.toThrow("inside working hours");
    await expect(a.mutation(api.availability.setHours, { hours: hours({ 1: { breakStartMinute: 720 } }) })).rejects.toThrow("start and an end");
  });
});

describe("customer availability and booking", () => {
  test("windows exclude breaks and closed days; blocked time and accepted bookings are busy; pending is not", async () => {
    const { t, a, customer, providerA } = await setup();
    await a.mutation(api.availability.setHours, { hours: hours({ 0: { enabled: false }, 3: { breakStartMinute: 720, breakEndMinute: 780 } }) });
    const wed = nextWeekday(3), sun = nextWeekday(0);
    const startsAt = localToUtc(wed, 10 * 60);
    const bookingId = await customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId: providerA, customerName: "K", description: "d", startsAt, endsAt: startsAt + HOUR });
    const day = async (date: string) => (await t.query(api.availability.forProvider, { providerId: providerA, days: 31 })).days.find((d) => d.date === date)!;

    expect((await day(wed)).windows).toEqual([[540, 720], [780, 1020]]);
    expect((await day(sun)).windows).toEqual([]);
    expect((await day(wed)).busy).toEqual([]); // pending does not reserve

    await a.mutation(api.bookings.transition, { bookingId, to: "accepted" });
    expect((await day(wed)).busy).toEqual([[600, 660]]);

    await a.mutation(api.availability.addTimeOff, { startsAt: localToUtc(wed, 14 * 60), endsAt: localToUtc(wed, 15 * 60), reason: "Dentist" });
    expect((await day(wed)).busy).toEqual([[600, 660], [840, 900]]);
  });

  test("creating a booking enforces hours, breaks, closed days, blocked time and accepted bookings", async () => {
    const { a, customer, providerA } = await setup();
    await a.mutation(api.availability.setHours, { hours: hours({ 0: { enabled: false }, 3: { breakStartMinute: 720, breakEndMinute: 780 } }) });
    const wed = nextWeekday(3), sun = nextWeekday(0);
    const book = (date: string, from: number, to: number) =>
      customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId: providerA, customerName: "K", description: "d", startsAt: localToUtc(date, from), endsAt: localToUtc(date, to) });
    await expect(book(wed, 10 * 60, 11 * 60)).resolves.toBeTruthy();
    await expect(book(wed, 8 * 60, 9 * 60 + 30)).rejects.toThrow("isn't available"); // before opening
    await expect(book(wed, 16 * 60, 18 * 60)).rejects.toThrow("isn't available"); // after closing
    await expect(book(wed, 11 * 60 + 30, 13 * 60 + 30)).rejects.toThrow("isn't available"); // across the break
    await expect(book(sun, 10 * 60, 11 * 60)).rejects.toThrow("isn't available"); // closed day
    await a.mutation(api.availability.addTimeOff, { startsAt: localToUtc(wed, 14 * 60), endsAt: localToUtc(wed, 15 * 60) });
    await expect(book(wed, 14 * 60 + 30, 15 * 60 + 30)).rejects.toThrow("isn't available"); // blocked
    await expect(book(wed, 15 * 60, 16 * 60)).resolves.toBeTruthy(); // right after the block
  });

  test("a provider who never set hours is only held to blocked time", async () => {
    const { a, customer, providerA } = await setup();
    const d = nextWeekday(2);
    await a.mutation(api.availability.addTimeOff, { startsAt: localToUtc(d, 6 * 60), endsAt: localToUtc(d, 7 * 60) });
    const book = (from: number, to: number) => customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId: providerA, customerName: "K", description: "d", startsAt: localToUtc(d, from), endsAt: localToUtc(d, to) });
    await expect(book(6 * 60 + 30, 7 * 60 + 30)).rejects.toThrow("isn't available");
    await expect(book(20 * 60, 21 * 60)).resolves.toBeTruthy();
  });
});

describe("time off", () => {
  test("only the owner can add or remove blocks; past and inverted ranges are refused", async () => {
    const { a, b, customer } = await setup();
    const start = Date.now() + 24 * HOUR;
    const id = await a.mutation(api.availability.addTimeOff, { startsAt: start, endsAt: start + HOUR, reason: "  Holiday  " });
    expect((await a.query(api.availability.mine, {}))?.timeOff).toMatchObject([{ reason: "Holiday" }]);
    await expect(b.mutation(api.availability.removeTimeOff, { id })).rejects.toThrow(/Block not found|provider profile/);
    await expect(customer.mutation(api.availability.addTimeOff, { startsAt: start, endsAt: start + HOUR })).rejects.toThrow("provider profile");
    await expect(a.mutation(api.availability.addTimeOff, { startsAt: start, endsAt: start })).rejects.toThrow("future");
    await expect(a.mutation(api.availability.addTimeOff, { startsAt: Date.now() - 2 * HOUR, endsAt: Date.now() - HOUR })).rejects.toThrow("future");
    await a.mutation(api.availability.removeTimeOff, { id });
    expect((await a.query(api.availability.mine, {}))?.timeOff).toEqual([]);
  });
});

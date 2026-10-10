import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

const HOUR = 3_600_000;

async function setup() {
  const t = newT();
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { name: "Fern Gardens" });
  const customerId = await createUser(t, "customer", "kiri@example.nz");
  const owner = asUser(t, ownerId), customer = asUser(t, customerId), stranger = asUser(t, await createUser(t, "customer"));
  let n = 0;
  const request = () => {
    const startsAt = Date.now() + (24 + 3 * n++) * HOUR;
    return customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "Kiri", description: "Mow", startsAt, endsAt: startsAt + HOUR });
  };
  return { t, owner, customer, stranger, providerId, request };
}
const kinds = async (u: Awaited<ReturnType<typeof setup>>["owner"]) => (await u.query(api.notifications.mine, {})).map((x) => x.kind);

describe("notifications", () => {
  test("a request notifies the provider; their decision notifies the customer", async () => {
    const { owner, customer, request } = await setup();
    const id = await request();
    expect(await kinds(owner)).toEqual(["booking_requested"]);
    expect(await customer.query(api.notifications.mine, {})).toEqual([]);
    expect((await owner.query(api.notifications.mine, {}))[0]).toMatchObject({ title: "New booking request", href: `/provider/bookings/${id}`, read: false });

    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "completed" });
    expect(await kinds(customer)).toEqual(["booking_completed", "booking_accepted"]);
    expect((await customer.query(api.notifications.mine, {}))[0].href).toBe(`/bookings/${id}/review`);

    const other = await request();
    await owner.mutation(api.bookings.transition, { bookingId: other, to: "declined" });
    expect((await kinds(customer))[0]).toBe("booking_declined");
  });

  test("a customer cancelling notifies the provider; a provider cancelling notifies the customer", async () => {
    const { owner, customer, request } = await setup();
    const a = await request();
    await customer.mutation(api.bookings.transition, { bookingId: a, to: "cancelled" });
    expect((await kinds(owner))[0]).toBe("booking_cancelled");
    const b = await request();
    await owner.mutation(api.bookings.transition, { bookingId: b, to: "cancelled" });
    expect((await kinds(customer))[0]).toBe("booking_cancelled");
  });

  test("a refused transition sends nothing", async () => {
    const { owner, customer, request } = await setup();
    const id = await request();
    await customer.mutation(api.bookings.transition, { bookingId: id, to: "accepted" }); // customers cannot accept
    expect(await kinds(owner)).toEqual(["booking_requested"]);
    expect(await kinds(customer)).toEqual([]);
  });

  test("a review notifies the provider", async () => {
    const { owner, customer, request } = await setup();
    const id = await request();
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "completed" });
    await customer.mutation(api.reviews.create, { bookingId: id, rating: 5, text: "" });
    expect((await owner.query(api.notifications.mine, {}))[0]).toMatchObject({ kind: "review_received", href: "/provider/reviews" });
  });

  test("unread count and mark-read are private to the owner", async () => {
    const { t, owner, customer, stranger, request } = await setup();
    const id = await request();
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    await request();
    expect(await owner.query(api.notifications.unreadCount, {})).toBe(2);
    expect(await t.query(api.notifications.unreadCount, {})).toBe(0);
    expect(await stranger.query(api.notifications.unreadCount, {})).toBe(0);

    const [first] = await owner.query(api.notifications.mine, {});
    await expect(stranger.mutation(api.notifications.markRead, { id: first._id })).rejects.toThrow("not found");
    await expect(customer.mutation(api.notifications.markRead, { id: first._id })).rejects.toThrow("not found");
    await owner.mutation(api.notifications.markRead, { id: first._id });
    expect(await owner.query(api.notifications.unreadCount, {})).toBe(1);
    await owner.mutation(api.notifications.markAllRead, {});
    expect(await owner.query(api.notifications.unreadCount, {})).toBe(0);
    expect(await customer.query(api.notifications.unreadCount, {})).toBe(1); // customer's own acceptance notice is untouched
  });

  test("seeded providers without an owner do not break bookings", async () => {
    const { t, customer } = await setup();
    const orphan = await createProvider(t);
    const startsAt = Date.now() + 90 * HOUR;
    await expect(customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId: orphan, customerName: "K", description: "d", startsAt, endsAt: startsAt + HOUR })).resolves.toBeTruthy();
  });
});

describe("clearing notifications", () => {
  test("a user clears one or all of their own; nobody can clear someone else's", async () => {
    const { owner, customer, stranger, request } = await setup();
    await request(); await request();
    const [first] = await owner.query(api.notifications.mine, {});
    await expect(stranger.mutation(api.notifications.clear, { id: first._id })).rejects.toThrow("not found");
    await expect(customer.mutation(api.notifications.clear, { id: first._id })).rejects.toThrow("not found");
    expect(await owner.query(api.notifications.mine, {})).toHaveLength(2);
    await owner.mutation(api.notifications.clear, { id: first._id });
    expect(await owner.query(api.notifications.mine, {})).toHaveLength(1);
    expect(await stranger.mutation(api.notifications.clearAll, {})).toBe(false); // touches only the caller's own
    expect(await owner.query(api.notifications.mine, {})).toHaveLength(1);
    expect(await owner.mutation(api.notifications.clearAll, {})).toBe(false);
    expect(await owner.query(api.notifications.mine, {})).toEqual([]);
    expect(await owner.query(api.notifications.unreadCount, {})).toBe(0);
  });
});

describe("old notifications", () => {
  test("the daily sweep removes notifications older than 60 days and keeps newer ones", async () => {
    const { t, owner, request } = await setup();
    await request();
    const day = 86_400_000, now = Date.now();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(now + 59 * day);
      await t.mutation(internal.notifications.sweepOld, {});
      expect(await owner.query(api.notifications.mine, {})).toHaveLength(1);
      vi.setSystemTime(now + 61 * day);
      await t.mutation(internal.notifications.sweepOld, {});
      expect(await owner.query(api.notifications.mine, {})).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});

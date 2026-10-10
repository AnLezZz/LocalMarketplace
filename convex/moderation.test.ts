import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { withReview, withoutReview } from "./model/reviewStats";

const HOUR = 3_600_000;

async function world() {
  const t = newT();
  const adminId = await createUser(t, "admin", "boss@example.nz");
  const ownerId = await createUser(t, "provider", "fern@example.nz");
  const providerId = await createProvider(t, ownerId, { name: "Fern Gardens", ratingAvg: 0, reviewCount: 0 });
  const customerId = await createUser(t, "customer", "kiri@example.nz");
  await t.run((ctx) => ctx.db.patch(customerId, { name: "Kiri Tane" }));
  const admin = asUser(t, adminId), owner = asUser(t, ownerId), customer = asUser(t, customerId), stranger = asUser(t, await createUser(t, "customer"));
  let n = 0;
  const book = async (status: "requested" | "accepted" | "completed" = "completed") => {
    const startsAt = Date.now() + (30 + 4 * n++) * HOUR;
    const id = await customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "Kiri", description: "Mow", startsAt, endsAt: startsAt + HOUR });
    if (status !== "requested") await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    if (status === "completed") await owner.mutation(api.bookings.transition, { bookingId: id, to: "completed" });
    return id;
  };
  const review = async (rating = 5, text = "nice") => {
    const id = await book();
    await customer.mutation(api.reviews.create, { bookingId: id, rating, text });
    const row = (await t.run((ctx) => ctx.db.query("reviews").collect())).find((r) => r.bookingId === id)!;
    return row._id;
  };
  const audit = async () => (await admin.query(api.admin.listAudit, { paginationOpts: PAGE })).page.map((a) => a.action);
  return { t, admin, owner, customer, stranger, adminId, ownerId, customerId, providerId, book, review, audit };
}

const PAGE = { numItems: 50, cursor: null };

describe("rating maths", () => {
  test("withoutReview is the exact inverse of withReview", () => {
    const start = { ratingAvg: 4.5, reviewCount: 10 };
    expect(withoutReview(withReview(start, 3), 3)).toEqual(start);
    expect(withoutReview({ ratingAvg: 5, reviewCount: 1 }, 5)).toEqual({ ratingAvg: 0, reviewCount: 0 });
    expect(withoutReview({ ratingAvg: 0, reviewCount: 0 }, 5)).toEqual({ ratingAvg: 0, reviewCount: 0 });
  });
});

describe("admin access", () => {
  test("every admin query and mutation refuses customers, providers and signed-out callers", async () => {
    const { t, owner, customer, providerId, customerId, book } = await world();
    const bookingId = await book("requested");
    const calls = (u: { query: any; mutation: any }) => [
      () => u.query(api.admin.listProviders, { paginationOpts: PAGE }), () => u.query(api.admin.listUsers, { paginationOpts: PAGE }), () => u.query(api.admin.listBookings, { paginationOpts: PAGE }),
      () => u.query(api.admin.getBooking, { id: bookingId }), () => u.query(api.admin.listReviewReports, { paginationOpts: PAGE }), () => u.query(api.admin.listHiddenReviews, { paginationOpts: PAGE }),
      () => u.query(api.admin.listDisputes, { paginationOpts: PAGE }), () => u.query(api.admin.listAudit, { paginationOpts: PAGE }),
      () => u.mutation(api.admin.suspendProvider, { providerId, reason: "because reasons" }), () => u.mutation(api.admin.suspendUser, { userId: customerId, reason: "because reasons" }),
      () => u.mutation(api.admin.cancelBooking, { bookingId, reason: "because reasons" }),
    ];
    for (const who of [owner, customer, t]) for (const call of calls(who)) await expect(call()).rejects.toThrow(/Not allowed|Sign in required/);
  });
});

describe("provider suspension", () => {
  test("hides the provider everywhere, blocks resubmitting and accepting, and reactivation restores it", async () => {
    const { t, admin, owner, customer, providerId, book, audit } = await world();
    await customer.mutation(api.favourites.toggle, { providerId });
    await owner.mutation(api.services.create, { name: "Mow", description: "", priceType: "fixed", priceCents: 5000, durationMinutes: 60 });
    const pending = await book("requested");

    await expect(admin.mutation(api.admin.suspendProvider, { providerId, reason: "no" })).rejects.toThrow("at least 5");
    await admin.mutation(api.admin.suspendProvider, { providerId, reason: "Repeated no-shows" });

    expect((await t.query(api.providers.list, {})).map((p) => p._id)).not.toContain(providerId);
    expect(await t.query(api.providers.get, { id: providerId })).toBeNull();
    expect((await customer.query(api.favourites.listPage, { paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([]);
    expect(await t.query(api.services.listForProvider, { providerId })).toEqual([]);
    expect(await t.query(api.services.listPublic, {})).toEqual([]);
    expect((await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([]);
    expect((await t.query(api.availability.forProvider, { providerId, days: 3 })).days).toEqual([]);
    const startsAt = Date.now() + 200 * HOUR;
    await expect(customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "K", description: "d", startsAt, endsAt: startsAt + HOUR })).rejects.toThrow("provider not found");

    expect(await owner.query(api.providers.mine, {})).toMatchObject({ status: "suspended" });
    await expect(owner.mutation(api.providers.submitProfile, { name: "Fern", bio: "b", category: "cleaning", suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" })).rejects.toThrow("suspended");
    expect(await owner.mutation(api.bookings.transition, { bookingId: pending, to: "accepted" })).toMatchObject({ ok: false, reason: expect.stringContaining("not currently active") });
    expect((await owner.query(api.notifications.mine, {}))[0]).toMatchObject({ kind: "provider_suspended", body: expect.stringContaining("Repeated no-shows") });

    await expect(admin.mutation(api.admin.suspendProvider, { providerId, reason: "twice over" })).rejects.toThrow("approved providers");
    await admin.mutation(api.admin.reactivateProvider, { providerId });
    expect(await t.query(api.providers.get, { id: providerId })).toMatchObject({ _id: providerId });
    expect(await owner.query(api.providers.mine, {})).toMatchObject({ status: "approved" });
    expect(await owner.mutation(api.bookings.transition, { bookingId: pending, to: "accepted" })).toEqual({ ok: true });
    await expect(admin.mutation(api.admin.reactivateProvider, { providerId })).rejects.toThrow("not suspended");
    expect(await audit()).toEqual(expect.arrayContaining(["provider.suspend", "provider.reactivate"]));
  });

  test("admins cannot suspend their own listing", async () => {
    const { t, admin, adminId } = await world();
    const mine = await createProvider(t, adminId);
    await expect(admin.mutation(api.admin.suspendProvider, { providerId: mine, reason: "my own listing" })).rejects.toThrow("own listing");
  });
});

describe("user suspension", () => {
  test("blocks every write but not reads, takes the listing with it, and reactivation is deliberate", async () => {
    const { t, admin, owner, ownerId, providerId, customer, customerId, book } = await world();
    const id = await book("requested");
    await admin.mutation(api.admin.suspendUser, { userId: customerId, reason: "Abusive messages" });
    expect(await customer.query(api.users.me, {})).toMatchObject({ suspended: true });
    expect((await customer.query(api.bookings.listMine, {})).length).toBe(1); // can still read
    await expect(customer.mutation(api.favourites.toggle, { providerId })).rejects.toThrow("suspended");
    await expect(customer.mutation(api.bookings.transition, { bookingId: id, to: "cancelled" })).rejects.toThrow("suspended");
    await expect(customer.mutation(api.notifications.markAllRead, {})).rejects.toThrow("suspended");

    await admin.mutation(api.admin.suspendUser, { userId: ownerId, reason: "Fake profile" });
    expect(await owner.query(api.providers.mine, {})).toMatchObject({ status: "suspended" });
    expect(await t.query(api.providers.get, { id: providerId })).toBeNull();

    await admin.mutation(api.admin.reactivateUser, { userId: customerId });
    await customer.mutation(api.favourites.toggle, { providerId: await createProvider(t) });
    await expect(admin.mutation(api.admin.reactivateProvider, { providerId })).rejects.toThrow("owner's account");
    await admin.mutation(api.admin.reactivateUser, { userId: ownerId });
    expect(await owner.query(api.providers.mine, {})).toMatchObject({ status: "suspended" }); // the listing stays down until reactivated on purpose
    await admin.mutation(api.admin.reactivateProvider, { providerId });
    expect(await owner.query(api.providers.mine, {})).toMatchObject({ status: "approved" });
  });

  test("admins and yourself are protected; double suspension is refused", async () => {
    const { t, admin, adminId, customerId } = await world();
    const otherAdmin = await createUser(t, "admin");
    await expect(admin.mutation(api.admin.suspendUser, { userId: adminId, reason: "myself here" })).rejects.toThrow("yourself");
    await expect(admin.mutation(api.admin.suspendUser, { userId: otherAdmin, reason: "another admin" })).rejects.toThrow("Admins can't");
    await admin.mutation(api.admin.suspendUser, { userId: customerId, reason: "first time" });
    await expect(admin.mutation(api.admin.suspendUser, { userId: customerId, reason: "second time" })).rejects.toThrow("Already");
  });

  test("list filters by status and search", async () => {
    const { admin, customerId } = await world();
    await admin.mutation(api.admin.suspendUser, { userId: customerId, reason: "for the filter" });
    expect((await admin.query(api.admin.listUsers, { status: "suspended", paginationOpts: PAGE })).page.map((u) => u._id)).toEqual([customerId]);
    expect((await admin.query(api.admin.listUsers, { status: "active", paginationOpts: PAGE })).page.some((u) => u._id === customerId)).toBe(false);
    expect((await admin.query(api.admin.listUsers, { q: "KIRI", paginationOpts: PAGE })).page.map((u) => u.email)).toEqual(["kiri@example.nz"]);
  });
});

describe("review reports and moderation", () => {
  test("only the reviewed business can report, once; hiding removes the review from the rating and restoring puts it back", async () => {
    const { t, admin, owner, customer, stranger, providerId, review, audit } = await world();
    const good = await review(5, "great"), bad = await review(1, "terrible and false");
    const rating = async () => { const p = await t.run((ctx) => ctx.db.get(providerId)); return { avg: p!.ratingAvg, n: p!.reviewCount }; };
    expect(await rating()).toEqual({ avg: 3, n: 2 });

    await expect(stranger.mutation(api.reviews.report, { reviewId: bad, reason: "this is not true at all" })).rejects.toThrow("review not found");
    await expect(customer.mutation(api.reviews.report, { reviewId: bad, reason: "this is not true at all" })).rejects.toThrow("review not found");
    await expect(owner.mutation(api.reviews.report, { reviewId: bad, reason: "short" })).rejects.toThrow("at least 10");
    const reportId = await owner.mutation(api.reviews.report, { reviewId: bad, reason: "Never had a booking like this" });
    await expect(owner.mutation(api.reviews.report, { reviewId: bad, reason: "Reporting again please" })).rejects.toThrow("already been reported");
    expect((await admin.query(api.admin.listReviewReports, { paginationOpts: PAGE })).page[0]).toMatchObject({ _id: reportId, providerName: "Fern Gardens", review: { rating: 1, text: "terrible and false", hidden: false } });

    await expect(admin.mutation(api.admin.resolveReviewReport, { reportId, action: "hide" })).rejects.toThrow("at least 5");
    await admin.mutation(api.admin.resolveReviewReport, { reportId, action: "hide", note: "Not a real customer experience" });
    expect(await rating()).toEqual({ avg: 5, n: 1 });
    expect((await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 50, cursor: null } })).page.map((r) => r._id)).toEqual([good]);
    expect((await admin.query(api.admin.listHiddenReviews, { paginationOpts: PAGE })).page[0]).toMatchObject({ _id: bad, hiddenReason: "Not a real customer experience" });
    expect((await admin.query(api.admin.listReviewReports, { status: "upheld", paginationOpts: PAGE })).page.map((r) => r._id)).toEqual([reportId]);
    expect((await customer.query(api.notifications.mine, {})).some((n) => n.kind === "review_hidden")).toBe(true);
    expect((await owner.query(api.notifications.mine, {})).some((n) => n.kind === "report_resolved")).toBe(true);
    await expect(admin.mutation(api.admin.resolveReviewReport, { reportId, action: "dismiss" })).rejects.toThrow("already resolved");
    await expect(owner.mutation(api.reviews.report, { reviewId: bad, reason: "Reporting a hidden review" })).rejects.toThrow("review not found");

    await admin.mutation(api.admin.restoreReview, { reviewId: bad, note: "Reconsidered" });
    expect(await rating()).toEqual({ avg: 3, n: 2 });
    expect((await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 50, cursor: null } })).page.length).toBe(2);
    await expect(admin.mutation(api.admin.restoreReview, { reviewId: bad })).rejects.toThrow("not hidden");
    expect(await audit()).toEqual(expect.arrayContaining(["review.hide", "report.uphold", "review.restore"]));
  });

  test("dismissing leaves the review and the rating untouched", async () => {
    const { t, admin, owner, providerId, review } = await world();
    const id = await review(4, "fine");
    const reportId = await owner.mutation(api.reviews.report, { reviewId: id, reason: "I just disagree with it" });
    await admin.mutation(api.admin.resolveReviewReport, { reportId, action: "dismiss", note: "It follows the rules" });
    expect((await t.query(api.reviews.forProvider, { providerId, paginationOpts: { numItems: 50, cursor: null } })).page.length).toBe(1);
    expect(await t.run((ctx) => ctx.db.get(providerId))).toMatchObject({ ratingAvg: 4, reviewCount: 1 });
    expect((await admin.query(api.admin.listReviewReports, { status: "dismissed", paginationOpts: PAGE })).page[0]).toMatchObject({ resolutionNote: "It follows the rules" });
  });
});

describe("disputes", () => {
  test("either participant can raise one on an accepted booking; admins resolve it and both are told", async () => {
    const { admin, owner, customer, stranger, book, audit } = await world();
    const open = await book("requested"), accepted = await book("accepted");
    await expect(customer.mutation(api.disputes.open, { bookingId: open, reason: "They did not turn up at all" })).rejects.toThrow("once a booking has been accepted");
    await expect(stranger.mutation(api.disputes.open, { bookingId: accepted, reason: "They did not turn up at all" })).rejects.toThrow("booking not found");
    await expect(customer.mutation(api.disputes.open, { bookingId: accepted, reason: "too short" })).rejects.toThrow("at least 10");
    const id = await customer.mutation(api.disputes.open, { bookingId: accepted, reason: "They did not turn up at all" });
    await expect(owner.mutation(api.disputes.open, { bookingId: accepted, reason: "Customer was not home either" })).rejects.toThrow("already an open dispute");
    expect((await owner.query(api.notifications.mine, {}))[0]).toMatchObject({ kind: "dispute_opened", href: `/provider/bookings/${accepted}` });
    expect(await customer.query(api.bookings.getForCustomer, { id: accepted })).toMatchObject({ dispute: { status: "open", openedBy: "customer" } });
    expect(await owner.query(api.bookings.getForProvider, { id: accepted })).toMatchObject({ dispute: { status: "open", reason: "They did not turn up at all" } });

    expect((await admin.query(api.admin.listDisputes, { paginationOpts: PAGE })).page.map((d) => d._id)).toEqual([id]);
    expect((await admin.query(api.admin.listBookings, { paginationOpts: PAGE })).page.find((b) => b._id === accepted)?.disputeOpen).toBe(true);
    await expect(admin.mutation(api.admin.resolveDispute, { disputeId: id, resolution: "short" })).rejects.toThrow("at least 10");
    await admin.mutation(api.admin.resolveDispute, { disputeId: id, resolution: "Provider will rebook for free" });
    expect((await customer.query(api.notifications.mine, {}))[0]).toMatchObject({ kind: "dispute_resolved", body: expect.stringContaining("rebook for free") });
    expect((await owner.query(api.notifications.mine, {}))[0].kind).toBe("dispute_resolved");
    expect(await customer.query(api.bookings.getForCustomer, { id: accepted })).toMatchObject({ dispute: { status: "resolved", resolution: "Provider will rebook for free" } });
    await expect(admin.mutation(api.admin.resolveDispute, { disputeId: id, resolution: "Resolving it a second time" })).rejects.toThrow("already resolved");
    expect((await admin.query(api.admin.listDisputes, { status: "resolved", paginationOpts: PAGE })).page.length).toBe(1);
    await owner.mutation(api.disputes.open, { bookingId: accepted, reason: "A new problem has come up" }); // allowed once the first is resolved
    expect(await audit()).toContain("dispute.resolve");
  });
});

describe("admin bookings", () => {
  test("lists and filters bookings, shows full detail, and force-cancels with a reason", async () => {
    const { admin, owner, customer, book, audit } = await world();
    const a = await book("requested"), b = await book("accepted"), c = await book("completed");
    expect((await admin.query(api.admin.listBookings, { paginationOpts: PAGE })).page.length).toBe(3);
    expect((await admin.query(api.admin.listBookings, { status: "accepted", paginationOpts: PAGE })).page.map((x) => x._id)).toEqual([b]);
    expect((await admin.query(api.admin.listBookings, { q: "fern", paginationOpts: PAGE })).page.length).toBe(3);
    expect((await admin.query(api.admin.listBookings, { q: "nobody", paginationOpts: PAGE })).page.length).toBe(0);
    expect(await admin.query(api.admin.getBooking, { id: b })).toMatchObject({ address: "12 Test Street", customerEmail: "kiri@example.nz", providerName: "Fern Gardens", status: "accepted" });
    expect(await admin.query(api.admin.getBooking, { id: "nope" })).toBeNull();

    await expect(admin.mutation(api.admin.cancelBooking, { bookingId: c, reason: "completed jobs stay" })).rejects.toThrow("open bookings");
    await expect(admin.mutation(api.admin.cancelBooking, { bookingId: a, reason: "no" })).rejects.toThrow("at least 5");
    await admin.mutation(api.admin.cancelBooking, { bookingId: b, reason: "Safety concern raised" });
    expect(await customer.query(api.bookings.getForCustomer, { id: b })).toMatchObject({ status: "cancelled" });
    const events = (await admin.query(api.admin.getBooking, { id: b }))!.events;
    expect(events.at(-1)).toMatchObject({ to: "cancelled", by: "admin" });
    for (const u of [customer, owner]) expect((await u.query(api.notifications.mine, {})).some((n) => n.title === "Booking cancelled by Localo" && n.body.includes("Safety concern raised"))).toBe(true);
    expect(await audit()).toContain("booking.cancel");
  });
});

describe("audit log", () => {
  test("records who did what and why, newest first", async () => {
    const { admin, customerId, providerId, audit } = await world();
    await admin.mutation(api.admin.suspendUser, { userId: customerId, reason: "Spam bookings" });
    await admin.mutation(api.admin.suspendProvider, { providerId, reason: "Poor service quality" });
    const rows = (await admin.query(api.admin.listAudit, { paginationOpts: PAGE })).page;
    expect(rows[0]).toMatchObject({ action: "provider.suspend", targetType: "provider", reason: "Poor service quality", actor: "admin" });
    expect(rows.map((r) => r.action)).toEqual(["provider.suspend", "user.suspend"]);
    expect(await audit()).toHaveLength(2);
  });
});

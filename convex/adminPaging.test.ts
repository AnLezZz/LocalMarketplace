import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import type { Id } from "./_generated/dataModel";

const HOUR = 3_600_000;


async function world() {
  const t = newT();
  const admin = asUser(t, await createUser(t, "admin", "boss@example.nz"));
  return { t, admin };
}
/** Walks every page of a table with a small page size and returns all rows plus how many pages it took. */
async function walk<R extends { _id: string }>(read: (cursor: string | null) => Promise<{ page: R[]; isDone: boolean; continueCursor: string }>) {
  const rows: R[] = []; let cursor: string | null = null, pages = 0;
  for (; pages < 100;) {
    const r = await read(cursor); pages++; rows.push(...r.page);
    if (r.isDone) return { rows, pages };
    cursor = r.continueCursor;
  }
  throw new Error("never finished");
}
const opts = (cursor: string | null, numItems = 7) => ({ numItems, cursor });

describe("admin tables page through any amount of data", () => {
  test("providers: every row exactly once, newest first, and a status filter still fills pages", async () => {
    const { t, admin } = await world();
    const ids: Id<"providers">[] = [];
    for (let i = 0; i < 23; i++) ids.push(await createProvider(t, await createUser(t, "provider"), { name: `Provider ${i}`, approved: i % 2 === 0 }));
    const all = await walk((c) => admin.query(api.admin.listProviders, { paginationOpts: opts(c) }));
    expect(all.rows.map((r) => r._id)).toEqual([...ids].reverse());
    expect(all.pages).toBe(4); // 23 rows, 7 a page
    const approved = await walk((c) => admin.query(api.admin.listProviders, { status: "approved", paginationOpts: opts(c) }));
    expect(approved.rows).toHaveLength(12);
    expect(approved.rows.every((r) => r.status === "approved")).toBe(true);
    expect(approved.pages).toBe(2); // full pages: 7 + 5, not 4 thin ones
    const pending = await walk((c) => admin.query(api.admin.listProviders, { status: "pending", paginationOpts: opts(c) }));
    expect(pending.rows).toHaveLength(11);
    await t.run((ctx) => ctx.db.patch(ids[0], { suspendedAt: Date.now(), suspendedReason: "x" }));
    expect((await walk((c) => admin.query(api.admin.listProviders, { status: "suspended", paginationOpts: opts(c) }))).rows.map((r) => r._id)).toEqual([ids[0]]);
    expect((await walk((c) => admin.query(api.admin.listProviders, { status: "approved", paginationOpts: opts(c) }))).rows).toHaveLength(11);
  });

  test("customers and bookings: filters and paging agree with the data", async () => {
    const { t, admin } = await world();
    const ownerId = await createUser(t, "provider");
    const providerId = await createProvider(t, ownerId, { name: "Fern Gardens", approved: true });
    const users: Id<"users">[] = [];
    for (let i = 0; i < 15; i++) users.push(await createUser(t, "customer", `c${i}@example.nz`));
    await t.run(async (ctx) => { for (const u of users.slice(0, 4)) await ctx.db.patch(u, { suspendedAt: Date.now(), suspendedReason: "x" }); });
    expect((await walk((c) => admin.query(api.admin.listUsers, { status: "suspended", paginationOpts: opts(c, 3) }))).rows).toHaveLength(4);
    const active = await walk((c) => admin.query(api.admin.listUsers, { status: "active", paginationOpts: opts(c, 5) }));
    expect(active.rows.filter((r) => r.role === "customer")).toHaveLength(11);
    const statuses = ["requested", "accepted", "completed", "cancelled", "declined"] as const;
    await t.run(async (ctx) => { for (let i = 0; i < 30; i++) await ctx.db.insert("bookings", { providerId, customerId: users[5], customerName: `Cust ${i}`, customerEmail: "x@example.nz", description: "job", startsAt: Date.now() + i * HOUR, endsAt: Date.now() + (i + 1) * HOUR, status: statuses[i % 5] }); });
    expect((await walk((c) => admin.query(api.admin.listBookings, { paginationOpts: opts(c, 8) }))).rows).toHaveLength(30);
    const done = await walk((c) => admin.query(api.admin.listBookings, { status: "completed", paginationOpts: opts(c, 4) }));
    expect(done.rows).toHaveLength(6);
    expect(done.rows.every((r) => r.status === "completed")).toBe(true);
    expect(done.pages).toBe(2);
    expect((await admin.query(api.admin.listBookings, { status: "nonsense", paginationOpts: opts(null, 50) })).page).toHaveLength(30); // an unknown status is ignored
  });

  test("a search reads the newest rows once, keeps the matches, and says when it may have missed older ones", async () => {
    const { t, admin } = await world();
    const ownerId = await createUser(t, "provider");
    const providerId = await createProvider(t, ownerId, { name: "Fern Gardens", approved: true });
    await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) await ctx.db.insert("bookings", { providerId, customerName: i < 110 ? "Kiri" : "Aroha", customerEmail: "x@example.nz", description: "job", startsAt: Date.now() + i * HOUR, endsAt: Date.now() + (i + 1) * HOUR, status: "requested" });
    });
    const few = await admin.query(api.admin.listBookings, { q: "aroha", paginationOpts: opts(null, 7) });
    expect(few).toMatchObject({ searched: true, isDone: true, truncated: false });
    expect(few.page).toHaveLength(10);
    const many = await admin.query(api.admin.listBookings, { q: "kiri", paginationOpts: opts(null, 7) });
    expect(many.page).toHaveLength(100); // capped
    expect(many.truncated).toBe(true);
    expect((await admin.query(api.admin.listBookings, { q: "nobody", paginationOpts: opts(null, 7) })).page).toEqual([]);
  });

  test("audit log, disputes and reports page too; the sidebar counts are capped and admin-only", async () => {
    const { t, admin } = await world();
    const ownerId = await createUser(t, "provider");
    const providerId = await createProvider(t, ownerId, { approved: true });
    const adminId = (await t.run((ctx) => ctx.db.query("users").collect())).find((u) => u.role === "admin")!._id;
    await t.run(async (ctx) => {
      for (let i = 0; i < 18; i++) await ctx.db.insert("auditLog", { actorId: adminId, action: `thing.${i}`, targetType: "x", targetId: `id${i}` });
      const customerId = await ctx.db.insert("users", { role: "customer", email: "k@example.nz" });
      for (let i = 0; i < 9; i++) {
        const bookingId = await ctx.db.insert("bookings", { providerId, customerId, customerName: "Kiri", customerEmail: "k@example.nz", description: "job", startsAt: Date.now() + i * HOUR, endsAt: Date.now() + (i + 1) * HOUR, status: "completed" });
        await ctx.db.insert("disputes", { bookingId, openedBy: "customer", openedById: customerId, reason: "something went wrong here", status: "open" });
      }
    });
    const log = await walk((c) => admin.query(api.admin.listAudit, { paginationOpts: opts(c, 5) }));
    expect(log.rows).toHaveLength(18);
    expect(log.rows[0].action).toBe("thing.17");
    expect((await walk((c) => admin.query(api.admin.listDisputes, { paginationOpts: opts(c, 4) }))).rows).toHaveLength(9);
    expect(await admin.query(api.admin.sidebarCounts, {})).toEqual({ applications: 0, reports: 0, disputes: 9, categoryRequests: 0 });
    await expect(t.query(api.admin.sidebarCounts, {})).rejects.toThrow();
    const customer = asUser(t, await createUser(t, "customer"));
    await expect(customer.query(api.admin.sidebarCounts, {})).rejects.toThrow();
    await expect(customer.query(api.admin.listAudit, { paginationOpts: opts(null) })).rejects.toThrow();
  });
});

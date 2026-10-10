import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createProvider, newT } from "../test-utils/harness";

async function world(n = 45) {
  const t = newT();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(await createProvider(t, undefined, {
      name: `Provider ${i}`, category: i % 3 === 0 ? "gardening" : "cleaning", suburb: i % 2 ? "Ponsonby" : "Mount Eden",
      rateCents: 3000 + (i % 10) * 1000, ratingAvg: (i % 5) + 0.5, reviewCount: i % 7, bio: i === 7 ? "Specialist in moss" : "Bio",
    }));
  }
  await createProvider(t, undefined, { name: "Hidden", approved: false });
  return { t, ids };
}
const page = (t: Awaited<ReturnType<typeof world>>["t"], offset: number, limit: number, extra: Record<string, unknown> = {}) =>
  t.query(api.providers.search, { offset, limit, ...extra } as never) as Promise<{ rows: { _id: string; rateCents: number; ratingAvg: number; reviewCount: number }[]; total: number; capped: boolean }>;

describe("provider search pages", () => {
  test("pages cover every approved provider exactly once, with the true total", async () => {
    const { t } = await world();
    const seen: string[] = [];
    for (let offset = 0; offset < 60; offset += 20) {
      const r = await page(t, offset, 20);
      expect(r.total).toBe(45); // the unapproved one is not counted
      seen.push(...r.rows.map((x) => x._id));
    }
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
    expect((await page(t, 40, 20)).rows).toHaveLength(5);
    expect((await page(t, 100, 20)).rows).toEqual([]);
  });

  test("filters and order apply before the page is cut, so the total and the rows agree", async () => {
    const { t } = await world();
    const cheap = await page(t, 0, 50, { maxCents: 5000, sort: "low" });
    expect(cheap.total).toBe(cheap.rows.length);
    expect(cheap.rows.every((r) => r.rateCents <= 5000)).toBe(true);
    expect(cheap.rows.map((r) => r.rateCents)).toEqual([...cheap.rows.map((r) => r.rateCents)].sort((a, b) => a - b));
    const good = await page(t, 0, 50, { minRating: 4 });
    expect(good.rows.every((r) => r.reviewCount > 0 && r.ratingAvg >= 4)).toBe(true);
    const gardening = await page(t, 0, 50, { category: "gardening" });
    expect(gardening.total).toBe(15);
    const [p1, p2] = [await page(t, 0, 7, { category: "gardening", sort: "best" }), await page(t, 7, 7, { category: "gardening", sort: "best" })];
    expect(p1.rows.map((r) => r._id).filter((id) => p2.rows.some((r) => r._id === id))).toEqual([]);
    expect((await page(t, 0, 5, { q: "MOSS" })).total).toBe(1); // keyword matches the bio, case-insensitive
    expect((await page(t, 0, 50, { suburb: "ponsonby" })).total).toBe(22);
  });

  test("an order that ties is still stable between pages, and the page size is limited", async () => {
    const { t } = await world();
    const a = (await page(t, 0, 10, { sort: "reviews" })).rows.map((r) => r._id);
    const b = (await page(t, 0, 10, { sort: "reviews" })).rows.map((r) => r._id);
    expect(a).toEqual(b);
    expect((await page(t, 0, 10_000)).rows).toHaveLength(45); // clamped to 50, and there are only 45
    expect((await page(t, -5, 0)).rows).toHaveLength(1); // a nonsense page is made sane
  });
});

describe("realCount", () => {
  test("counts approved providers that someone owns, not seeded demo listings or unapproved ones", async () => {
    const t = newT();
    const { createUser } = await import("../test-utils/harness");
    for (let i = 0; i < 3; i++) await createProvider(t, undefined, { name: `Seed ${i}` }); // approved, no owner
    await createProvider(t, await createUser(t, "provider"), { name: "Owned" });
    await createProvider(t, await createUser(t, "provider"), { name: "Owned too" });
    await createProvider(t, await createUser(t, "provider"), { name: "Pending", approved: false });
    expect(await t.query(api.providers.realCount, {})).toBe(2);
  });
});

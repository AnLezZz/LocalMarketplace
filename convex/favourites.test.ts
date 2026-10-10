import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

async function setup() {
  const t = newT();
  const owner = await createUser(t, "provider");
  const provider = await createProvider(t, owner);
  const other = await createProvider(t);
  const alice = asUser(t, await createUser(t, "customer"));
  const bob = asUser(t, await createUser(t, "customer"));
  return { t, owner: asUser(t, owner), provider, other, alice, bob };
}

const PAGE = { numItems: 50, cursor: null };

describe("favourites", () => {
  test("toggle saves then removes; each user only sees their own", async () => {
    const { alice, bob, provider, other } = await setup();
    expect(await alice.mutation(api.favourites.toggle, { providerId: provider })).toBe(true);
    expect(await alice.mutation(api.favourites.toggle, { providerId: other })).toBe(true);
    expect((await alice.query(api.favourites.savedAmong, { providerIds: [provider, other] })).sort()).toEqual([provider, other].sort());
    expect(await bob.query(api.favourites.savedAmong, { providerIds: [provider, other] })).toEqual([]);
    expect(await alice.mutation(api.favourites.toggle, { providerId: provider })).toBe(false);
    expect((await alice.query(api.favourites.listPage, { paginationOpts: PAGE })).page.map((p) => p!._id)).toEqual([other]);
  });

  test("refuses signed-out callers, unapproved providers and your own listing; hides providers that lose approval", async () => {
    const { t, owner, provider, other, alice } = await setup();
    await expect(t.mutation(api.favourites.toggle, { providerId: provider })).rejects.toThrow("Sign in required");
    const pending = await createProvider(t, undefined, { approved: false });
    await expect(alice.mutation(api.favourites.toggle, { providerId: pending })).rejects.toThrow("provider not found");
    await expect(owner.mutation(api.favourites.toggle, { providerId: provider })).rejects.toThrow("own listing");
    await alice.mutation(api.favourites.toggle, { providerId: other });
    await t.run((ctx) => ctx.db.patch(other, { approved: false }));
    expect((await alice.query(api.favourites.listPage, { paginationOpts: PAGE })).page).toEqual([]);
    expect((await t.query(api.favourites.listPage, { paginationOpts: PAGE })).page).toEqual([]);
  });
});

describe("any number of favourites", () => {
  test("page newest first without repeats, and the heart check works past what a list would show", async () => {
    const { t, alice, bob } = await setup();
    const saved: string[] = [];
    for (let i = 0; i < 27; i++) { const p = await createProvider(t, undefined, { name: `P${i}` }); await alice.mutation(api.favourites.toggle, { providerId: p }); saved.push(p); }
    const got: string[] = []; let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const r: { page: { _id: string }[]; isDone: boolean; continueCursor: string } = await alice.query(api.favourites.listPage, { paginationOpts: { numItems: 10, cursor } });
      got.push(...r.page.map((p) => p._id));
      if (r.isDone) break;
      cursor = r.continueCursor;
    }
    expect(got).toEqual([...saved].reverse());
    const stranger = await createProvider(t);
    expect((await alice.query(api.favourites.savedAmong, { providerIds: [saved[0], stranger, saved[26]] as never })).sort()).toEqual([saved[0], saved[26]].sort());
    expect(await bob.query(api.favourites.savedAmong, { providerIds: saved.slice(0, 5) as never })).toEqual([]);
    expect(await t.query(api.favourites.savedAmong, { providerIds: saved.slice(0, 5) as never })).toEqual([]);
    await t.run((ctx) => ctx.db.patch(saved[26] as never, { approved: false })); // an unapproved provider drops out of the list
    const first = await alice.query(api.favourites.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(first.page.some((p) => p._id === saved[26])).toBe(false);
  });
});

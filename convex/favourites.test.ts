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

describe("favourites", () => {
  test("toggle saves then removes; each user only sees their own", async () => {
    const { alice, bob, provider, other } = await setup();
    expect(await alice.mutation(api.favourites.toggle, { providerId: provider })).toBe(true);
    expect(await alice.mutation(api.favourites.toggle, { providerId: other })).toBe(true);
    expect((await alice.query(api.favourites.mineIds, {})).sort()).toEqual([provider, other].sort());
    expect(await bob.query(api.favourites.mineIds, {})).toEqual([]);
    expect(await alice.mutation(api.favourites.toggle, { providerId: provider })).toBe(false);
    expect((await alice.query(api.favourites.listMine, {})).map((p) => p!._id)).toEqual([other]);
  });

  test("refuses signed-out callers, unapproved providers and your own listing; hides providers that lose approval", async () => {
    const { t, owner, provider, other, alice } = await setup();
    await expect(t.mutation(api.favourites.toggle, { providerId: provider })).rejects.toThrow("Sign in required");
    const pending = await createProvider(t, undefined, { approved: false });
    await expect(alice.mutation(api.favourites.toggle, { providerId: pending })).rejects.toThrow("provider not found");
    await expect(owner.mutation(api.favourites.toggle, { providerId: provider })).rejects.toThrow("own listing");
    await alice.mutation(api.favourites.toggle, { providerId: other });
    await t.run((ctx) => ctx.db.patch(other, { approved: false }));
    expect(await alice.query(api.favourites.listMine, {})).toEqual([]);
    expect(await t.query(api.favourites.listMine, {})).toEqual([]);
  });
});

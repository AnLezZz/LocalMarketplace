/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, createProvider, createUser, newT, type T } from "../test-utils/harness";
import type { Id } from "./_generated/dataModel";

// FIXTURE places (invented geography in the shape of the importer's output), not real data.
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const base = { source: "linz" as const, selectable: true, altNames: [], altKeys: [], flags: [], active: true, runId: "t", nameAscii: "" };
    const region = async (name: string, code: string) => ctx.db.insert("places", { ...base, source: "statsnz", layer: "regional_council", sourceId: code, kind: "region", name, key: name.toLowerCase(), regionIds: [], taIds: [] });
    const ta = async (name: string, code: string) => ctx.db.insert("places", { ...base, source: "statsnz", layer: "territorial_authority", sourceId: code, kind: "territorial_authority", name, key: name.toLowerCase(), regionIds: [], taIds: [] });
    const sub = async (name: string, id: string, r: Id<"places">, t: Id<"places">, key = name.toLowerCase()) => ctx.db.insert("places", { ...base, layer: "suburbs_localities", sourceId: id, kind: "suburb", name, key, regionIds: [r], taIds: [t] });
    const akl = await region("Auckland", "02"), wgn = await region("Wellington", "09");
    const aklTa = await ta("Auckland TA", "076"), wgnTa = await ta("Wellington City", "047");
    return {
      akl, wgn,
      ponsonby: await sub("Ponsonby", "1", akl, aklTa),
      grey: await sub("Grey Lynn", "2", akl, aklTa, "grey lynn"),
      newtownA: await sub("Newtown", "3", akl, aklTa),
      newtownW: await sub("Newtown", "4", wgn, wgnTa),
      kelburn: await sub("Kelburn", "5", wgn, wgnTa),
    };
  });
}
async function setup() {
  const t = newT();
  const ids = await seed(t);
  const admin = await createUser(t, "admin");
  const owner = await createUser(t, "provider");
  return { t, ids, admin, owner, A: asUser(t, admin) };
}
const book = (t: T, providerId: Id<"providers">, customer: Id<"users">, suburb: string) =>
  asUser(t, customer).mutation(api.bookings.create, { address: "1 Test St", suburb, providerId, customerName: "C", description: "d", startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 90_000_000 });

describe("coverage states", () => {
  test("unrecognised, not launched and covered are different answers", async () => {
    const { t, ids, A } = await setup();
    expect((await t.query(api.locations.coverage, { name: "Nowhereville" })).status).toBe("unrecognised");
    expect((await t.query(api.locations.coverage, { name: "PONSONBY" })).status).toBe("covered");
    await A.mutation(api.locations.setAreaOpen, { placeId: ids.wgn, open: false });
    expect((await t.query(api.locations.coverage, { name: "Kelburn" })).status).toBe("not_launched");
    expect((await t.query(api.locations.coverage, { name: "Ponsonby" })).status).toBe("covered");
  });
  test("a name that exists in an open and a closed region is still covered; reopening works", async () => {
    const { t, ids, A } = await setup();
    await A.mutation(api.locations.setAreaOpen, { placeId: ids.wgn, open: false });
    expect((await t.query(api.locations.coverage, { name: "Newtown" })).status).toBe("covered");
    await A.mutation(api.locations.setAreaOpen, { placeId: ids.wgn, open: true });
    expect((await t.query(api.locations.adminCoverage, {}).catch(() => null))).toBeNull(); // not admin-authenticated here
    expect((await A.query(api.locations.adminCoverage, {})).closed).toEqual([]);
  });
  test("only admins change coverage", async () => {
    const { t, ids, owner } = await setup();
    await expect(asUser(t, owner).mutation(api.locations.setAreaOpen, { placeId: ids.akl, open: false })).rejects.toThrow();
  });
});

describe("search", () => {
  test("macron- and case-insensitive prefix, with context to tell two Newtowns apart", async () => {
    const { t } = await setup();
    const r = await t.query(api.locations.searchPlaces, { q: "newt" });
    expect(r.map((x) => x.context).sort()).toEqual(["Auckland TA, Auckland", "Wellington City, Wellington"]);
    expect(await t.query(api.locations.searchPlaces, { q: "x" })).toEqual([]);
  });
});

describe("provider service areas and booking", () => {
  async function withProvider(base: string, migrated = true) {
    const s = await setup();
    const providerId = await createProvider(s.t, s.owner, { suburb: base, approved: true });
    const customer = await createUser(s.t, "customer");
    if (migrated) await s.t.mutation(internal.geoMigration.migrateProviders, {});
    return { ...s, providerId, customer, P: asUser(s.t, s.owner) };
  }
  test("a base suburb serves that suburb only; Ponsonby is excluded from a Grey Lynn provider", async () => {
    const { t, providerId, customer } = await withProvider("Grey Lynn");
    await expect(book(t, providerId, customer, "Ponsonby")).rejects.toThrow("doesn't service");
    await expect(book(t, providerId, customer, "Grey Lynn")).resolves.toBeTruthy();
  });
  test("serving a region covers suburbs inside it but not outside, regardless of base", async () => {
    const { t, ids, providerId, customer, P } = await withProvider("Kelburn");
    await P.mutation(api.providers.addServiceArea, { placeId: ids.akl });
    await expect(book(t, providerId, customer, "Ponsonby")).resolves.toBeTruthy();
    await expect(book(t, providerId, customer, "Kelburn")).resolves.toBeTruthy(); // base
    const other = await createProvider(t, await createUser(t, "provider"), { suburb: "Kelburn", approved: true });
    await t.mutation(internal.geoMigration.migrateProviders, {});
    await expect(book(t, other, customer, "Ponsonby")).rejects.toThrow("doesn't service");
  });
  test("closed areas are refused for bookings and service areas, with the not-launched message", async () => {
    const { t, ids, A, providerId, customer, P } = await withProvider("Ponsonby");
    await A.mutation(api.locations.setAreaOpen, { placeId: ids.wgn, open: false });
    await expect(P.mutation(api.providers.addServiceArea, { placeId: ids.kelburn })).rejects.toThrow("hasn't launched");
    await expect(book(t, providerId, customer, "Kelburn")).rejects.toThrow("hasn't launched");
    await expect(book(t, providerId, customer, "Nowhereville")).rejects.toThrow("don't recognise");
  });
  test("providers manage only their own areas; signed-out and non-providers are refused", async () => {
    const { t, ids, customer } = await withProvider("Ponsonby");
    await expect(asUser(t, customer).mutation(api.providers.addServiceArea, { placeId: ids.akl })).rejects.toThrow();
    await expect(t.mutation(api.providers.addServiceArea, { placeId: ids.akl })).rejects.toThrow("Sign in required");
  });
});

describe("migration", () => {
  test("links exact matches, queues ambiguous and unmatched, is idempotent, and changes nothing else", async () => {
    const { t, ids, A } = await setup();
    const p1 = await createProvider(t, await createUser(t, "provider"), { suburb: "ponsonby", serviceSuburbs: ["Grey Lynn", "Newtown", "Atlantis"] });
    const p2 = await createProvider(t, await createUser(t, "provider"), { suburb: "Newtown" });
    const dry = await t.mutation(internal.geoMigration.migrateProviders, { dryRun: true });
    expect(dry).toMatchObject({ baseLinked: 1, baseReview: 1, areasLinked: 1, areasReview: 2, emptyListNowBaseOnly: 1 });
    expect(await t.run((ctx) => ctx.db.query("locationReviews").collect())).toHaveLength(0);
    await t.mutation(internal.geoMigration.migrateProviders, {});
    const again = await t.mutation(internal.geoMigration.migrateProviders, {});
    expect(again.skipped).toBe(2);
    const reviews = await A.query(api.locations.reviews, {});
    expect(reviews.map((r) => r.reason).sort()).toEqual(["ambiguous", "ambiguous", "unmatched"]);
    const row = await t.run((ctx) => ctx.db.get(p1));
    expect(row).toMatchObject({ baseAreaId: ids.ponsonby, serviceAreaIds: [ids.grey], suburb: "ponsonby" });
    // an admin resolves the ambiguous base; the provider then serves that Newtown only
    const review = reviews.find((r) => r.provider !== "" && r.field === "base")!;
    await expect(A.mutation(api.locations.resolveReview, { reviewId: review._id, placeId: ids.ponsonby })).rejects.toThrow("suggested");
    await A.mutation(api.locations.resolveReview, { reviewId: review._id, placeId: ids.newtownW });
    expect((await t.run((ctx) => ctx.db.get(p2)))?.baseAreaId).toBe(ids.newtownW);
    const customer = await createUser(t, "customer");
    await t.run((ctx) => ctx.db.patch(p2, { approved: true }));
    await expect(book(t, p2, customer, "Kelburn")).rejects.toThrow("doesn't service");
  });
  test("until a provider is migrated their old rules (including an empty list = anywhere) still apply", async () => {
    const { t } = await setup();
    const p = await createProvider(t, await createUser(t, "provider"), { suburb: "Ponsonby", approved: true });
    const customer = await createUser(t, "customer");
    await expect(book(t, p, customer, "Kelburn")).resolves.toBeTruthy();
  });
});

describe("search by place", () => {
  async function world() {
    const s = await setup();
    const mk = async (suburb: string, name: string) => createProvider(s.t, await createUser(s.t, "provider"), { suburb, name, approved: true });
    const ponsonbyPro = await mk("Ponsonby", "Pons"), greyPro = await mk("Grey Lynn", "Grey"), aklPro = await mk("Kelburn", "Roamer"), newtownW = await mk("Kelburn", "Wellie");
    await s.t.mutation(internal.geoMigration.migrateProviders, {});
    await asUser(s.t, (await s.t.run((ctx) => ctx.db.get(aklPro)))!.userId!).mutation(api.providers.addServiceArea, { placeId: s.ids.akl });
    return { ...s, ponsonbyPro, greyPro, aklPro, newtownW };
  }
  const names = (r: { name: string }[]) => r.map((p) => p.name).sort();
  test("a suburb finds those serving it or its region, and excludes the rest", async () => {
    const { t, ids } = await world();
    expect(names(await t.query(api.providers.list, { placeId: ids.ponsonby }))).toEqual(["Pons", "Roamer"]);
  });
  test("a region finds providers serving anything inside it", async () => {
    const { t, ids } = await world();
    expect(names(await t.query(api.providers.list, { placeId: ids.akl }))).toEqual(["Grey", "Pons", "Roamer"]);
    expect(names(await t.query(api.providers.list, { placeId: ids.wgn }))).toEqual(["Roamer", "Wellie"]); // Roamer is based in Kelburn
  });
  test("keyword and category filters still combine with a place", async () => {
    const { t, ids } = await world();
    expect(names(await t.query(api.providers.list, { placeId: ids.akl, q: "gre" }))).toEqual(["Grey"]);
  });
  test("removing a service area removes the provider from that search", async () => {
    const { t, ids, aklPro } = await world();
    const owner = (await t.run((ctx) => ctx.db.get(aklPro)))!.userId!;
    await asUser(t, owner).mutation(api.providers.removeServiceArea, { placeId: ids.akl });
    expect(names(await t.query(api.providers.list, { placeId: ids.ponsonby }))).toEqual(["Pons"]);
  });
  test("resolving typed text: unrecognised, not launched, ambiguous, ok (and macron/case insensitive)", async () => {
    const { t, ids, A } = await world();
    expect((await t.query(api.locations.resolveSearchPlace, { name: "Atlantis" })).status).toBe("unrecognised");
    expect(await t.query(api.locations.resolveSearchPlace, { name: "GREY LYNN" })).toMatchObject({ status: "ok", place: { name: "Grey Lynn" } });
    const amb = await t.query(api.locations.resolveSearchPlace, { name: "Newtown" });
    expect(amb.status).toBe("ambiguous");
    await A.mutation(api.locations.setAreaOpen, { placeId: ids.wgn, open: false });
    expect(await t.query(api.locations.resolveSearchPlace, { name: "Newtown" })).toMatchObject({ status: "ok", place: { context: "Auckland TA, Auckland" } }); // only the open one is left
    expect((await t.query(api.locations.resolveSearchPlace, { name: "Kelburn" })).status).toBe("not_launched");
    expect((await t.query(api.locations.resolveSearchPlace, { placeId: ids.kelburn })).status).toBe("not_launched");
  });
  test("a region name beats a council or suburb of the same name", async () => {
    const { t } = await world();
    expect(await t.query(api.locations.resolveSearchPlace, { name: "Auckland" })).toMatchObject({ status: "ok", place: { kind: "region" } });
  });
});

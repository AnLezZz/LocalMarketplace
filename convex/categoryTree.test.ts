import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

// convex-test records no content type for stored files; tell the image check what type each has (the rules themselves are real).
const types = vi.hoisted(() => new Map<string, string>());
vi.mock("./model/photos", async (orig) => {
  const real = await orig<typeof import("./model/photos")>();
  return {
    ...real,
    checkImage: async (ctx: any, id: string) => {
      const meta = await ctx.db.system.get(id);
      const problem = real.imageProblem(meta ? { size: meta.size, contentType: types.get(id) } : null);
      if (!problem) return { ok: true };
      if (meta) await ctx.storage.delete(id);
      return { ok: false, reason: problem };
    },
  };
});

async function world() {
  const t = newT();
  const admin = asUser(t, await createUser(t, "admin"));
  const ownerId = await createUser(t, "provider");
  const owner = asUser(t, ownerId);
  const customer = asUser(t, await createUser(t, "customer"));
  await admin.mutation(api.categories.initDefaults, {});
  await admin.mutation(api.categories.seedStarter, {});
  const rows = async () => (await t.query(api.categories.list, {})).categories;
  const by = async (slug: string) => (await rows()).find((c) => c.slug === slug)!;
  const profile = { name: "Fern", bio: "Hair and spa", category: "beauty wellness", suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const };
  return { t, admin, owner, ownerId, customer, rows, by, profile };
}

describe("hierarchy", () => {
  test("the examples give main > sub > service, in tree order, and run twice without duplicates", async () => {
    const { admin, rows } = await world();
    const before = (await rows()).length;
    expect(await admin.mutation(api.categories.seedStarter, {})).toBe(0);
    const all = await rows();
    expect(all).toHaveLength(before);
    const slugs = all.map((c) => c.slug);
    expect(slugs.slice(slugs.indexOf("beauty wellness"), slugs.indexOf("beauty wellness") + 6)).toEqual(["beauty wellness", "beauty wellness hair", "beauty wellness hair womens haircut", "beauty wellness hair mens haircut", "beauty wellness hair hair colouring", "beauty wellness spa"]);
    // every label appears once: no two "Plumbing"s, no "Cleaning" in two places
    const labels = all.map((c) => c.label.toLowerCase());
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
    expect(all.find((c) => c.slug === "beauty wellness hair womens haircut")).toMatchObject({ label: "Women's Haircut", depth: 2, parentSlug: "beauty wellness hair" });
  });
  test("the same name can sit under different parents; duplicates under one parent and a fourth level are refused", async () => {
    const { admin, by } = await world();
    // the mechanism still allows it when an admin wants it (the starter set avoids it)
    await admin.mutation(api.categories.create, { label: "Cleaning", icon: "cleaning", hue: "cleaning", parentId: (await by("pet care"))._id as any });
    expect((await by("pet care cleaning")).depth).toBe(1);
    expect(await by("cleaning")).toMatchObject({ depth: 0 });
    const hair = await by("beauty wellness hair");
    await expect(admin.mutation(api.categories.create, { label: "Facial", icon: "tag", hue: "neutral", parentId: (await by("beauty wellness spa"))._id as any })).rejects.toThrow("already a category");
    const leaf = await by("beauty wellness hair womens haircut");
    await expect(admin.mutation(api.categories.create, { label: "Too deep", icon: "tag", hue: "neutral", parentId: leaf._id as any })).rejects.toThrow("three levels");
    expect(hair.depth).toBe(1);
  });
  test("reordering moves a category among its own siblings only", async () => {
    const { admin, by, rows } = await world();
    await admin.mutation(api.categories.move, { id: (await by("beauty wellness spa"))._id as any, direction: "up" });
    const slugs = (await rows()).map((c) => c.slug);
    expect(slugs.indexOf("beauty wellness spa")).toBeLessThan(slugs.indexOf("beauty wellness hair"));
    expect(slugs.indexOf("cleaning")).toBeLessThan(slugs.indexOf("beauty wellness")); // main categories untouched
  });
});

describe("featured and homepage", () => {
  test("existing main categories stay on the homepage; new ones only when featured; disabling hides a whole branch", async () => {
    const { t, admin, by } = await world();
    const slugs = async () => (await t.query(api.categories.featured, {})).map((c) => c.slug);
    expect(await slugs()).toEqual(["cleaning", "gardening", "handyman", "pet care", "car detailing", "moving help", "plumbing electrical", "beauty wellness", "child family"]);
    await admin.mutation(api.categories.setFeatured, { id: (await by("beauty wellness hair"))._id as any, featured: true });
    expect(await slugs()).toContain("beauty wellness hair");
    await admin.mutation(api.categories.setEnabled, { id: (await by("beauty wellness"))._id as any, enabled: false });
    expect((await slugs()).filter((s) => s.startsWith("beauty"))).toEqual([]); // parent off, so the child is off too
    await admin.mutation(api.categories.setFeatured, { id: (await by("child family"))._id as any, featured: false });
    expect(await slugs()).not.toContain("child family");
  });
  test("rows saved before featuring existed: main categories show, others do not", async () => {
    const t = newT();
    const main = await t.run((ctx) => ctx.db.insert("categories", { slug: "old", label: "Old", icon: "tag", hue: "neutral", order: 0, enabled: true }));
    await t.run((ctx) => ctx.db.insert("categories", { slug: "old child", label: "Old child", icon: "tag", hue: "neutral", order: 0, enabled: true, parentId: main }));
    expect((await t.query(api.categories.featured, {})).map((c) => c.slug)).toEqual(["old"]);
  });
});

describe("providers and categories", () => {
  test("a provider offering a service is found under the service, its subcategory and its main category, and nowhere else", async () => {
    const { t, owner, profile } = await world();
    await owner.mutation(api.providers.submitProfile, { ...profile, more: ["beauty wellness hair womens haircut", "beauty wellness spa facial"] });
    await t.run(async (ctx) => { const p = (await ctx.db.query("providers").first())!; await ctx.db.patch(p._id, { approved: true }); });
    const found = async (category: string) => (await t.query(api.providers.list, { category })).length;
    for (const c of ["beauty wellness", "beauty wellness hair", "beauty wellness hair womens haircut", "beauty wellness spa", "beauty wellness spa facial"]) expect(await found(c)).toBe(1);
    for (const c of ["plumbing electrical", "beauty wellness hair mens haircut", "beauty wellness spa massage", "cleaning"]) expect(await found(c)).toBe(0);
  });
  test("a provider can offer several categories; unknown or disabled ones are refused, and kept ones stay valid", async () => {
    const { admin, owner, by, profile } = await world();
    await expect(owner.mutation(api.providers.submitProfile, { ...profile, more: ["nonsense"] })).rejects.toThrow("Unknown category");
    const id = await owner.mutation(api.providers.submitProfile, { ...profile, more: ["plumbing electrical plumbing", "cleaning"] });
    await admin.mutation(api.categories.setEnabled, { id: (await by("plumbing electrical"))._id as any, enabled: false });
    await expect(owner.mutation(api.providers.submitProfile, { ...profile, more: ["plumbing electrical electrical appliance installation"] })).rejects.toThrow("Unknown category"); // new pick under a disabled branch
    await owner.mutation(api.providers.submitProfile, { ...profile, more: ["plumbing electrical plumbing", "cleaning"] }); // unchanged picks stay valid
    expect(id).toBeTruthy();
  });
  test("old providers with only a primary category keep working", async () => {
    const { t } = await world();
    await createProvider(t, await createUser(t, "provider"), { category: "cleaning", approved: true });
    expect(await t.query(api.providers.list, { category: "cleaning" })).toHaveLength(1);
  });
});

describe("deleting and images", () => {
  test("delete only when nothing depends on it; admin only", async () => {
    const { t, admin, owner, customer, by, profile } = await world();
    await expect(customer.mutation(api.categories.remove, { id: (await by("plumbing electrical"))._id as any })).rejects.toThrow();
    await expect(admin.mutation(api.categories.remove, { id: (await by("plumbing electrical"))._id as any })).rejects.toThrow("Delete or move");
    await owner.mutation(api.providers.submitProfile, { ...profile, more: ["plumbing electrical plumbing leaks and repairs"] });
    await expect(admin.mutation(api.categories.remove, { id: (await by("plumbing electrical plumbing leaks and repairs"))._id as any })).rejects.toThrow("provider uses it");
    await admin.mutation(api.categories.remove, { id: (await by("plumbing electrical electrical appliance installation"))._id as any });
    expect((await t.query(api.categories.list, {})).categories.find((c) => c.slug === "plumbing electrical electrical appliance installation")).toBeUndefined();
  });
  test("an admin can set and clear an image; a bad file is refused", async () => {
    const { t, admin, customer, by } = await world();
    const cat = await by("cleaning");
    const good = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    types.set(good, "image/png");
    expect(await admin.mutation(api.categories.setImage, { id: cat._id as any, storageId: good })).toEqual({ ok: true });
    expect((await by("cleaning")).imageUrl).toBeTruthy();
    expect((await t.query(api.categories.featured, {})).find((c) => c.slug === "cleaning")!.imageUrl).toBeTruthy();
    const bad = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    types.set(bad, "application/pdf");
    expect(await admin.mutation(api.categories.setImage, { id: cat._id as any, storageId: bad })).toMatchObject({ ok: false });
    await expect(customer.mutation(api.categories.setImage, { id: cat._id as any, storageId: good })).rejects.toThrow();
    await admin.mutation(api.categories.removeImage, { id: cat._id as any });
    expect((await by("cleaning")).imageUrl).toBeNull();
  });
});

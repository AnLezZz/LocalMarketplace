import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { slugify, validateCategoryInput } from "./model/categories";

const profile = { name: "Fern", bio: "Gardens and more", category: "gardening", suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const };

async function world() {
  const t = newT();
  const admin = asUser(t, await createUser(t, "admin"));
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { category: "cleaning" });
  const owner = asUser(t, ownerId), customer = asUser(t, await createUser(t, "customer"));
  const list = async () => (await t.query(api.categories.list, {})).categories;
  return { t, admin, owner, customer, providerId, ownerId, list };
}

describe("helpers", () => {
  test("slugify and validation", () => {
    expect(slugify("Roof & Gutter  Care!")).toBe("roof gutter care");
    expect(slugify("Pet Care")).toBe("pet care");
    expect(validateCategoryInput({ label: "  Roofing  ", icon: "home", hue: "neutral" })).toEqual({ label: "Roofing", icon: "home", hue: "neutral" });
    expect(() => validateCategoryInput({ label: " ", icon: "home", hue: "neutral" })).toThrow("name");
    expect(() => validateCategoryInput({ label: "x".repeat(41), icon: "home", hue: "neutral" })).toThrow("too long");
    expect(() => validateCategoryInput({ label: "A", icon: "rocket", hue: "neutral" })).toThrow("icons");
    expect(() => validateCategoryInput({ label: "A", icon: "home", hue: "pink" })).toThrow("colours");
  });
});

describe("categories.list and defaults", () => {
  test("the built-ins apply before anything is saved; saving them is idempotent and audited", async () => {
    const { t, admin, list } = await world();
    const before = await t.query(api.categories.list, {});
    expect(before.saved).toBe(false);
    expect(before.categories.map((c) => c.slug)).toEqual(["cleaning", "gardening", "handyman", "pet care", "car detailing", "moving help"]);
    await admin.mutation(api.categories.initDefaults, {});
    await admin.mutation(api.categories.initDefaults, {});
    const after = await t.query(api.categories.list, {});
    expect(after.saved).toBe(true);
    expect((await list()).map((c) => c.slug)).toEqual(before.categories.map((c) => c.slug));
    expect((await admin.query(api.admin.listAudit, {})).filter((a) => a.action === "category.init")).toHaveLength(1);
  });
});

describe("categories admin", () => {
  test("create, update (slug stays), enable/disable and ordering", async () => {
    const { admin, list } = await world();
    await expect(admin.mutation(api.categories.create, { label: "Roofing", icon: "home", hue: "neutral" })).rejects.toThrow("Save the default");
    await admin.mutation(api.categories.initDefaults, {});
    const id = await admin.mutation(api.categories.create, { label: "Roof & Gutter Care", icon: "home", hue: "neutral" });
    expect((await list()).at(-1)).toMatchObject({ slug: "roof gutter care", label: "Roof & Gutter Care", order: 6, enabled: true });
    await expect(admin.mutation(api.categories.create, { label: "roof gutter care", icon: "home", hue: "neutral" })).rejects.toThrow("already a category");
    await expect(admin.mutation(api.categories.create, { label: "Bad icon", icon: "rocket", hue: "neutral" })).rejects.toThrow("icons");
    await admin.mutation(api.categories.update, { id, label: "Roofing", icon: "tag", hue: "car" });
    expect((await list()).at(-1)).toMatchObject({ slug: "roof gutter care", label: "Roofing", icon: "tag", hue: "car" }); // slug unchanged

    await admin.mutation(api.categories.move, { id, direction: "up" });
    expect((await list()).map((c) => c.slug).slice(-2)).toEqual(["roof gutter care", "moving help"]);
    expect((await list()).map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await admin.mutation(api.categories.move, { id, direction: "down" });
    await admin.mutation(api.categories.move, { id, direction: "down" }); // already last: no-op
    expect((await list()).at(-1)?.slug).toBe("roof gutter care");

    await admin.mutation(api.categories.setEnabled, { id, enabled: false });
    expect((await list()).at(-1)?.enabled).toBe(false);
  });

  test("at least one category stays enabled; there is a ceiling", async () => {
    const { admin, list } = await world();
    await admin.mutation(api.categories.initDefaults, {});
    const rows = await list();
    for (const c of rows.slice(1)) await admin.mutation(api.categories.setEnabled, { id: c._id as any, enabled: false });
    await expect(admin.mutation(api.categories.setEnabled, { id: rows[0]._id as any, enabled: false })).rejects.toThrow("At least one");
    for (const c of rows.slice(1)) await admin.mutation(api.categories.setEnabled, { id: c._id as any, enabled: true });
    for (let i = 0; i < 14; i++) await admin.mutation(api.categories.create, { label: `Extra ${i}`, icon: "tag", hue: "neutral" });
    await expect(admin.mutation(api.categories.create, { label: "One too many", icon: "tag", hue: "neutral" })).rejects.toThrow("up to 20");
  });

  test("only admins can change categories; the audit log records the changes", async () => {
    const { t, admin, owner, customer, list } = await world();
    for (const who of [owner, customer, t]) await expect(who.mutation(api.categories.initDefaults, {})).rejects.toThrow(/Not allowed|Sign in required/);
    await admin.mutation(api.categories.initDefaults, {});
    const id = (await list())[0]._id as any;
    for (const who of [owner, customer]) {
      await expect(who.mutation(api.categories.update, { id, label: "Hijack", icon: "home", hue: "neutral" })).rejects.toThrow("Not allowed");
      await expect(who.mutation(api.categories.setEnabled, { id, enabled: false })).rejects.toThrow("Not allowed");
      await expect(who.mutation(api.categories.move, { id, direction: "down" })).rejects.toThrow("Not allowed");
    }
    await admin.mutation(api.categories.setEnabled, { id, enabled: false });
    await admin.mutation(api.categories.setEnabled, { id, enabled: true });
    expect((await admin.query(api.admin.listAudit, {})).map((a) => a.action)).toEqual(expect.arrayContaining(["category.disable", "category.enable"]));
  });
});

describe("categories and provider profiles", () => {
  test("applications and edits only accept active categories; an unchanged one stays valid", async () => {
    const { admin, owner, ownerId, t, providerId, list } = await world();
    await admin.mutation(api.categories.initDefaults, {});
    const cleaning = (await list()).find((c) => c.slug === "cleaning")!;
    const gardening = (await list()).find((c) => c.slug === "gardening")!;
    const newId = await admin.mutation(api.categories.create, { label: "Roofing", icon: "home", hue: "neutral" });

    await owner.mutation(api.providers.updateProfile, { ...profile, category: "roofing" }); // new category works
    expect((await t.run((ctx) => ctx.db.get(providerId)))?.category).toBe("roofing");
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, category: "astrology" })).rejects.toThrow("Unknown category");

    await admin.mutation(api.categories.setEnabled, { id: newId, enabled: false });
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, category: "roofing", name: "Renamed" })).resolves.toBeNull(); // unchanged -> still allowed
    await admin.mutation(api.categories.setEnabled, { id: gardening._id as any, enabled: false });
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, category: "gardening" })).rejects.toThrow("Unknown category");
    // existing listings stay publicly visible even in a disabled category
    expect(await t.query(api.providers.get, { id: providerId })).toMatchObject({ category: "roofing" });

    // a new application is checked too
    const applicant = asUser(t, await createUser(t, "customer"));
    await expect(applicant.mutation(api.providers.submitProfile, { ...profile, category: "gardening" })).rejects.toThrow("Unknown category");
    await expect(applicant.mutation(api.providers.submitProfile, { ...profile, category: "cleaning" })).resolves.toBeTruthy();
    void ownerId; void cleaning;
  });
});

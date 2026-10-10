import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

// convex-test does not record a content type for stored files (production does), so the tests tell the
// check what type each file has. The validation rules themselves (imageProblem) are the real ones.
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
import { imageProblem } from "./model/photos";

describe("imageProblem", () => {
  test("accepts jpeg, png and webp up to 5 MB and nothing else", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) expect(imageProblem({ size: 5 * 1024 * 1024, contentType })).toBeNull();
    expect(imageProblem({ size: 1, contentType: "image/gif" })).toContain("JPEG, PNG or WebP");
    expect(imageProblem({ size: 1, contentType: "application/pdf" })).toContain("JPEG, PNG or WebP");
    expect(imageProblem({ size: 1 })).toContain("JPEG, PNG or WebP");
    expect(imageProblem({ size: 5 * 1024 * 1024 + 1, contentType: "image/png" })).toContain("5 MB");
    expect(imageProblem(null)).toContain("could not be found");
  });
});

const edit = { name: "Fern & Co Gardens", bio: "Lawns, hedges and planting.", category: "gardening", suburb: "Grey Lynn", rateCents: 6000, rateBasis: "hourly" as const };

async function world() {
  const t = newT();
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { name: "Old Name", photo: "/images/seed.jpg" });
  const owner = asUser(t, ownerId);
  const customer = asUser(t, await createUser(t, "customer"));
  const store = (type: string, bytes = 10) => t.run(async (ctx) => { const id = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })); types.set(id, type); return id; });
  const exists = (id: any) => t.run(async (ctx) => (await ctx.storage.get(id)) !== null);
  return { t, owner, ownerId, customer, providerId, store, exists };
}

describe("providers.updateProfile", () => {
  test("an approved provider edits their profile and the public sees it", async () => {
    const { t, owner, providerId } = await world();
    await owner.mutation(api.providers.updateProfile, edit);
    expect(await t.query(api.providers.get, { id: providerId })).toMatchObject({ name: "Fern & Co Gardens", suburb: "Grey Lynn", rateCents: 6000, category: "gardening" });
  });

  test("validates like an application, and refuses non-approved, suspended and non-providers", async () => {
    const { t, owner, customer, providerId } = await world();
    await expect(owner.mutation(api.providers.updateProfile, { ...edit, name: " " })).rejects.toThrow("required");
    await expect(owner.mutation(api.providers.updateProfile, { ...edit, category: "astrology" })).rejects.toThrow("Unknown category");
    await expect(owner.mutation(api.providers.updateProfile, { ...edit, rateCents: 50 })).rejects.toThrow("Rate");
    await expect(owner.mutation(api.providers.updateProfile, { ...edit, bio: "x".repeat(1001) })).rejects.toThrow("too long");
    await expect(customer.mutation(api.providers.updateProfile, edit)).rejects.toThrow("provider profile");
    await expect(t.mutation(api.providers.updateProfile, edit)).rejects.toThrow("Sign in required");
    await t.run((ctx) => ctx.db.patch(providerId, { approved: false, reviewedAt: undefined }));
    await expect(owner.mutation(api.providers.updateProfile, edit)).rejects.toThrow("still being reviewed");
    await t.run((ctx) => ctx.db.patch(providerId, { suspendedAt: Date.now() }));
    await expect(owner.mutation(api.providers.updateProfile, edit)).rejects.toThrow("suspended");
  });
});

describe("profile photo", () => {
  test("only an owner gets an upload URL", async () => {
    const { t, owner, customer } = await world();
    expect(await owner.mutation(api.providers.generateUploadUrl, {})).toEqual(expect.any(String));
    await expect(customer.mutation(api.providers.generateUploadUrl, {})).rejects.toThrow("provider profile");
    await expect(t.mutation(api.providers.generateUploadUrl, {})).rejects.toThrow("Sign in required");
  });

  test("an uploaded photo replaces the seeded one in every public query; the storage id stays internal", async () => {
    const { t, owner, customer, providerId, store } = await world();
    expect((await t.query(api.providers.get, { id: providerId }))?.photo).toBe("/images/seed.jpg");
    const id = await store("image/png");
    expect(await owner.mutation(api.providers.setPhoto, { storageId: id })).toEqual({ ok: true });
    const got = await t.query(api.providers.get, { id: providerId });
    expect(got?.photo).toMatch(/^https?:\/\//);
    expect(got).not.toHaveProperty("photoStorageId");
    expect((await t.query(api.providers.list, {}))[0].photo).toBe(got?.photo);
    expect((await owner.query(api.providers.mine, {}))?.photo).toBe(got?.photo);
    await customer.mutation(api.favourites.toggle, { providerId });
    expect((await customer.query(api.favourites.listMine, {}))[0]?.photo).toBe(got?.photo);
  });

  test("replacing deletes the old file; removing falls back to the seeded photo", async () => {
    const { t, owner, providerId, store, exists } = await world();
    const a = await store("image/jpeg"), b = await store("image/webp");
    await owner.mutation(api.providers.setPhoto, { storageId: a });
    await owner.mutation(api.providers.setPhoto, { storageId: b });
    expect(await exists(a)).toBe(false); expect(await exists(b)).toBe(true);
    await owner.mutation(api.providers.removePhoto, {});
    expect(await exists(b)).toBe(false);
    expect((await t.query(api.providers.get, { id: providerId }))?.photo).toBe("/images/seed.jpg");
  });

  test("a wrong type or an oversized file is rejected and deleted, not attached", async () => {
    const { t, owner, providerId, store, exists } = await world();
    const pdf = await store("application/pdf"), big = await store("image/png", 5 * 1024 * 1024 + 1), none = await store("");
    expect(await owner.mutation(api.providers.setPhoto, { storageId: pdf })).toEqual({ ok: false, reason: expect.stringContaining("JPEG, PNG or WebP") });
    expect(await owner.mutation(api.providers.setPhoto, { storageId: big })).toEqual({ ok: false, reason: expect.stringContaining("5 MB") });
    expect(await owner.mutation(api.providers.setPhoto, { storageId: none })).toMatchObject({ ok: false });
    for (const id of [pdf, big, none]) expect(await exists(id)).toBe(false);
    expect((await t.query(api.providers.get, { id: providerId }))?.photo).toBe("/images/seed.jpg");
    expect(await owner.mutation(api.providers.setPhoto, { storageId: pdf })).toEqual({ ok: false, reason: expect.stringContaining("could not be found") });
  });

  test("a suspended provider cannot upload", async () => {
    const { t, owner, providerId, store } = await world();
    await t.run((ctx) => ctx.db.patch(providerId, { suspendedAt: Date.now(), approved: false }));
    await expect(owner.mutation(api.providers.generateUploadUrl, {})).rejects.toThrow("suspended");
    await expect(owner.mutation(api.providers.setPhoto, { storageId: await store("image/png") })).rejects.toThrow("suspended");
  });
});

describe("gallery", () => {
  test("up to six photos; the seventh is refused and deleted; captions are trimmed; owner-only removal", async () => {
    const { t, owner, customer, providerId, store, exists } = await world();
    const ids = [];
    for (let i = 0; i < 6; i++) { const id = await store("image/jpeg"); ids.push(id); expect(await owner.mutation(api.providers.addGalleryPhoto, { storageId: id, caption: i === 0 ? "  Hedge makeover  " : undefined })).toEqual({ ok: true }); }
    const seventh = await store("image/jpeg");
    expect(await owner.mutation(api.providers.addGalleryPhoto, { storageId: seventh })).toEqual({ ok: false, reason: expect.stringContaining("up to 6") });
    expect(await exists(seventh)).toBe(false);

    const pub = await t.query(api.providers.gallery, { providerId });
    expect(pub).toHaveLength(6);
    expect(pub[0]).toMatchObject({ caption: "Hedge makeover", url: expect.stringMatching(/^https?:\/\//) });
    expect(await owner.query(api.providers.galleryMine, {})).toHaveLength(6);
    expect(await customer.query(api.providers.galleryMine, {})).toEqual([]);

    await expect(customer.mutation(api.providers.removeGalleryPhoto, { id: pub[0]._id })).rejects.toThrow(/provider profile|Photo not found/);
    await owner.mutation(api.providers.removeGalleryPhoto, { id: pub[0]._id });
    expect(await exists(ids[0])).toBe(false);
    expect(await t.query(api.providers.gallery, { providerId })).toHaveLength(5);
    await expect(owner.mutation(api.providers.removeGalleryPhoto, { id: pub[0]._id })).rejects.toThrow("Photo not found");
  });

  test("another provider cannot remove my photo; the public gallery is only for approved providers; bad files are refused", async () => {
    const { t, owner, providerId, store } = await world();
    const otherOwner = await createUser(t, "provider");
    await createProvider(t, otherOwner);
    const other = asUser(t, otherOwner);
    await owner.mutation(api.providers.addGalleryPhoto, { storageId: await store("image/png") });
    const [mine] = await owner.query(api.providers.galleryMine, {});
    await expect(other.mutation(api.providers.removeGalleryPhoto, { id: mine._id })).rejects.toThrow("Photo not found");
    expect(await owner.mutation(api.providers.addGalleryPhoto, { storageId: await store("text/html") })).toMatchObject({ ok: false });
    await t.run((ctx) => ctx.db.patch(providerId, { approved: false }));
    expect(await t.query(api.providers.gallery, { providerId })).toEqual([]); // not public until approved
    expect(await owner.query(api.providers.galleryMine, {})).toHaveLength(1); // but the owner can prepare it
  });
});

import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { emailCategory } from "./model/notify";

// convex-test records no content type for stored files, so the tests supply it (see profileEdit.test.ts).
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

const HOUR = 3_600_000;
const home = { label: "Home", address: "12 Ponsonby Road", suburb: "Ponsonby" };

async function world() {
  const t = newT();
  const id = await createUser(t, "customer", "kiri@example.nz");
  await t.run((ctx) => ctx.db.patch(id, { name: "Kiri Tane" }));
  const me = asUser(t, id), other = asUser(t, await createUser(t, "customer"));
  const store = (type: string) => t.run(async (ctx) => { const s = await ctx.storage.store(new Blob([new Uint8Array(10)], { type })); types.set(s, type); return s; });
  return { t, id, me, other, store };
}

describe("account.mine", () => {
  test("null when signed out; defaults to every email category on", async () => {
    const { t, me } = await world();
    expect(await t.query(api.account.mine, {})).toBeNull();
    expect(await me.query(api.account.mine, {})).toMatchObject({ name: "Kiri Tane", email: "kiri@example.nz", role: "customer", contactPhone: "", photo: null, emailPrefs: { updates: true, reminders: true, reviews: true }, addresses: [] });
  });
});

describe("account.updateProfile", () => {
  test("normalises the name and phone; blank clears the phone", async () => {
    const { me } = await world();
    await me.mutation(api.account.updateProfile, { name: "  Kiri   Tane-Smith ", contactPhone: "021 555 0123" });
    expect(await me.query(api.account.mine, {})).toMatchObject({ name: "Kiri Tane-Smith", contactPhone: "0215550123" });
    await me.mutation(api.account.updateProfile, { name: "Kiri", contactPhone: " " });
    expect((await me.query(api.account.mine, {}))?.contactPhone).toBe("");
  });
  test("validates; refuses signed-out and suspended users", async () => {
    const { t, id, me } = await world();
    await expect(me.mutation(api.account.updateProfile, { name: "  " })).rejects.toThrow("Enter your name");
    await expect(me.mutation(api.account.updateProfile, { name: "x".repeat(81) })).rejects.toThrow("too long");
    await expect(me.mutation(api.account.updateProfile, { name: "Kiri", contactPhone: "call me" })).rejects.toThrow("valid phone");
    await expect(t.mutation(api.account.updateProfile, { name: "Kiri" })).rejects.toThrow("Sign in required");
    await t.run((ctx) => ctx.db.patch(id, { suspendedAt: Date.now() }));
    await expect(me.mutation(api.account.updateProfile, { name: "Kiri" })).rejects.toThrow("suspended");
  });
});

describe("account photo", () => {
  test("upload, replace (old file deleted), remove; bad files rejected", async () => {
    const { t, me, store } = await world();
    const exists = (id: any) => t.run(async (ctx) => (await ctx.storage.get(id)) !== null);
    const a = await store("image/png"), b = await store("image/jpeg");
    expect(await me.mutation(api.account.setPhoto, { storageId: a })).toEqual({ ok: true });
    expect((await me.query(api.account.mine, {}))?.photo).toMatch(/^https?:\/\//);
    await me.mutation(api.account.setPhoto, { storageId: b });
    expect(await exists(a)).toBe(false);
    await me.mutation(api.account.removePhoto, {});
    expect(await exists(b)).toBe(false);
    expect((await me.query(api.account.mine, {}))?.photo).toBeNull();
    const pdf = await store("application/pdf");
    expect(await me.mutation(api.account.setPhoto, { storageId: pdf })).toMatchObject({ ok: false });
    expect(await exists(pdf)).toBe(false);
    expect(await me.mutation(api.account.generateUploadUrl, {})).toEqual(expect.any(String));
  });
});

describe("saved addresses", () => {
  test("the first is the default; a later one only on request; default is listed first", async () => {
    const { me } = await world();
    const a = await me.mutation(api.account.addAddress, home);
    const b = await me.mutation(api.account.addAddress, { label: "Work", address: "1 Queen Street", suburb: "CBD", accessNotes: " Level 3 " });
    let list = (await me.query(api.account.mine, {}))!.addresses;
    expect(list.map((x) => [x.label, x.isDefault])).toEqual([["Home", true], ["Work", false]]);
    expect(list[1].accessNotes).toBe("Level 3");
    await me.mutation(api.account.addAddress, { label: "Bach", address: "5 Beach Road", suburb: "Piha", makeDefault: true });
    list = (await me.query(api.account.mine, {}))!.addresses;
    expect(list.filter((x) => x.isDefault).map((x) => x.label)).toEqual(["Bach"]);
    expect(list[0].label).toBe("Bach");
    await me.mutation(api.account.setDefaultAddress, { id: a });
    expect((await me.query(api.account.mine, {}))!.addresses.filter((x) => x.isDefault).map((x) => x.label)).toEqual(["Home"]);
    void b;
  });

  test("removing the default promotes another; the limit and validation hold", async () => {
    const { me } = await world();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await me.mutation(api.account.addAddress, { label: `A${i}`, address: `${i + 10} Test Street`, suburb: "Ponsonby" }));
    await expect(me.mutation(api.account.addAddress, home)).rejects.toThrow("up to 5");
    await me.mutation(api.account.removeAddress, { id: ids[0] });
    const list = (await me.query(api.account.mine, {}))!.addresses;
    expect(list).toHaveLength(4); expect(list.filter((x) => x.isDefault)).toHaveLength(1);
    await expect(me.mutation(api.account.addAddress, { ...home, label: " " })).rejects.toThrow("name");
    await expect(me.mutation(api.account.addAddress, { ...home, address: "1" })).rejects.toThrow("street address");
    await expect(me.mutation(api.account.addAddress, { ...home, suburb: " " })).rejects.toThrow("suburb");
    await expect(me.mutation(api.account.addAddress, { ...home, label: "x".repeat(31) })).rejects.toThrow("too long");
  });

  test("addresses are private to their owner", async () => {
    const { t, me, other } = await world();
    const id = await me.mutation(api.account.addAddress, home);
    expect((await other.query(api.account.mine, {}))!.addresses).toEqual([]);
    await expect(other.mutation(api.account.removeAddress, { id })).rejects.toThrow("Address not found");
    await expect(other.mutation(api.account.setDefaultAddress, { id })).rejects.toThrow("Address not found");
    await expect(me.mutation(api.account.removeAddress, { id: "nope" })).rejects.toThrow("Address not found");
    await expect(t.mutation(api.account.removeAddress, { id })).rejects.toThrow("Sign in required");
    expect((await me.query(api.account.mine, {}))!.addresses).toHaveLength(1);
  });
});

describe("email preferences", () => {
  test("categories: reminders, reviews and moderation, account safety, everything else is updates", () => {
    expect(emailCategory("booking_reminder")).toBe("reminders");
    for (const k of ["review_received", "review_hidden", "report_resolved"]) expect(emailCategory(k)).toBe("reviews");
    for (const k of ["account_suspended", "account_reactivated", "provider_suspended", "provider_reactivated"]) expect(emailCategory(k)).toBe("always");
    for (const k of ["booking_requested", "booking_accepted", "quote_offered", "dispute_opened", "dispute_resolved"]) expect(emailCategory(k)).toBe("updates");
  });

  test("turning a category off stops its emails but keeps the in-app notification; safety emails always go", async () => {
    vi.useFakeTimers();
    const { t } = await world();
    const ownerId = await createUser(t, "provider", "fern@example.nz");
    const providerId = await createProvider(t, ownerId);
    const owner = asUser(t, ownerId);
    const customer = asUser(t, await createUser(t, "customer", "k2@example.nz"));
    const adminId = await createUser(t, "admin");
    const admin = asUser(t, adminId);
    const scheduled = () => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const book = async (n: number) => {
      const startsAt = Date.now() + (30 + 4 * n) * HOUR;
      return customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "K", description: "d", startsAt, endsAt: startsAt + HOUR });
    };
    const titles = async () => (await scheduled()).map((j: any) => j.args[0].title);

    await owner.mutation(api.account.setEmailPrefs, { updates: false, reminders: true, reviews: true });
    const id = await book(0);
    expect(await titles()).not.toContain("New booking request"); // email skipped
    expect((await owner.query(api.notifications.mine, {})).some((n) => n.kind === "booking_requested")).toBe(true); // in-app kept

    // reminders still on: a reminder email is queued
    await owner.mutation(api.account.setEmailPrefs, { updates: false, reminders: true, reviews: true });
    await t.run(async (ctx) => { await ctx.db.patch(id, { status: "accepted", startsAt: Date.now() + 2 * HOUR, endsAt: Date.now() + 3 * HOUR }); });
    await t.mutation(internal.reminders.sendDue, {});
    expect(await titles()).toContain("Reminder: a job is coming up");

    // reminders off too: no further reminder email for the provider
    const before = (await titles()).filter((x) => x === "Reminder: a job is coming up").length;
    await owner.mutation(api.account.setEmailPrefs, { updates: false, reminders: false, reviews: true });
    const id2 = await book(1);
    await t.run(async (ctx) => { await ctx.db.patch(id2, { status: "accepted", startsAt: Date.now() + 4 * HOUR, endsAt: Date.now() + 5 * HOUR }); });
    await t.mutation(internal.reminders.sendDue, {});
    expect((await titles()).filter((x) => x === "Reminder: a job is coming up").length).toBe(before);

    // everything off: a suspension email is still sent
    await owner.mutation(api.account.setEmailPrefs, { updates: false, reminders: false, reviews: false });
    await admin.mutation(api.admin.suspendProvider, { providerId, reason: "Policy breach found" });
    expect(await titles()).toContain("Your listing was suspended");
    vi.useRealTimers();
  });
});

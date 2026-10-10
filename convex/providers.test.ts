import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createUser, newT } from "../test-utils/harness";

const profile = {
  name: "Kiwi Cleaners", bio: "Weekly cleans.", category: "cleaning",
  suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const,
};

describe("providers.submitProfile", () => {
  test("rejects signed-out callers", async () => {
    const t = newT();
    await expect(t.mutation(api.providers.submitProfile, profile)).rejects.toThrow("Sign in required");
  });

  test("creates a pending profile, makes the user a provider, and hides it from search", async () => {
    const t = newT();
    const userId = await createUser(t, "customer");
    const u = asUser(t, userId);
    await u.mutation(api.providers.submitProfile, profile);
    const mine = await u.query(api.providers.mine, {});
    expect(mine).toMatchObject({ status: "pending", userId, approved: false });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.role).toBe("provider");
    expect(await t.query(api.providers.list, {})).toEqual([]);
  });

  test("keeps a 'my service isn't listed' note for the admin, trimmed, and clears it on resubmit", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    await u.mutation(api.providers.submitProfile, { ...profile, categorySuggestion: "  Window   tinting " });
    expect((await u.query(api.providers.mine, {}))?.categorySuggestion).toBe("Window tinting");
    await u.mutation(api.providers.submitProfile, { ...profile, categorySuggestion: "  " });
    expect((await u.query(api.providers.mine, {}))?.categorySuggestion).toBeUndefined();
  });

  test("rejects an over-long category suggestion", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    await expect(u.mutation(api.providers.submitProfile, { ...profile, categorySuggestion: "x".repeat(101) })).rejects.toThrow("under 100");
  });

  test("one profile per user: resubmitting updates in place", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    const first = await u.mutation(api.providers.submitProfile, profile);
    const second = await u.mutation(api.providers.submitProfile, { ...profile, suburb: "Grey Lynn" });
    expect(second).toBe(first);
    const all = await t.run((ctx) => ctx.db.query("providers").collect());
    expect(all).toHaveLength(1);
    expect(all[0].suburb).toBe("Grey Lynn");
  });

  test("a rejected profile can be resubmitted and returns to pending", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    const id = await u.mutation(api.providers.submitProfile, profile);
    await t.run((ctx) => ctx.db.patch(id, { reviewedAt: 1, rejectionReason: "Photo missing" }));
    expect((await u.query(api.providers.mine, {}))?.status).toBe("rejected");
    await u.mutation(api.providers.submitProfile, profile);
    const again = await u.query(api.providers.mine, {});
    expect(again?.status).toBe("pending");
    expect(again?.rejectionReason).toBeUndefined();
  });

  test("an approved profile cannot be edited (category swap would bypass vetting)", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    const id = await u.mutation(api.providers.submitProfile, profile);
    await t.run((ctx) => ctx.db.patch(id, { approved: true, reviewedAt: 1 }));
    await expect(u.mutation(api.providers.submitProfile, { ...profile, category: "handyman" })).rejects.toThrow("Approved profiles");
  });

  test("validates input", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    await expect(u.mutation(api.providers.submitProfile, { ...profile, category: "wizardry" })).rejects.toThrow("Unknown category");
    await expect(u.mutation(api.providers.submitProfile, { ...profile, rateCents: 12.5 })).rejects.toThrow("Rate");
    await expect(u.mutation(api.providers.submitProfile, { ...profile, rateCents: 0 })).rejects.toThrow("Rate");
    await expect(u.mutation(api.providers.submitProfile, { ...profile, name: "   " })).rejects.toThrow("required");
  });

  test("admins cannot be providers", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "admin"));
    await expect(u.mutation(api.providers.submitProfile, profile)).rejects.toThrow("Admins cannot");
  });
});

describe("providers.mine", () => {
  test("is null when signed out or without a profile", async () => {
    const t = newT();
    expect(await t.query(api.providers.mine, {})).toBeNull();
    const u = asUser(t, await createUser(t, "customer"));
    expect(await u.query(api.providers.mine, {})).toBeNull();
  });
});

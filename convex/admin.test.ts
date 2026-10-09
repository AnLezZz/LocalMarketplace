import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT, type T } from "../test-utils/harness";
import type { Id } from "./_generated/dataModel";

const profile = {
  name: "Kiwi Cleaners", bio: "Weekly cleans.", category: "cleaning",
  suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const,
};

async function apply(t: T, email = "applicant@example.nz") {
  const userId = await createUser(t, "customer", email);
  const u = asUser(t, userId);
  const providerId: Id<"providers"> = await u.mutation(api.providers.submitProfile, profile);
  return { u, userId, providerId };
}

async function stamp(t: T, providerId: Id<"providers">): Promise<number> {
  const row = await t.run((ctx) => ctx.db.get(providerId));
  return row!.submittedAt as number;
}

describe("admin access", () => {
  test("signed-out and non-admin callers are refused", async () => {
    const t = newT();
    const { u, providerId } = await apply(t);
    await expect(t.query(api.admin.listPending, {})).rejects.toThrow("Sign in required");
    await expect(u.query(api.admin.listPending, {})).rejects.toThrow("Not allowed");
    const submittedAt = await stamp(t, providerId);
    await expect(u.mutation(api.admin.review, { providerId, decision: "approve", submittedAt })).rejects.toThrow("Not allowed");
  });
});

describe("admin.listPending", () => {
  test("lists only pending applications, with the owner's email", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const pending = await apply(t, "p1@example.nz");
    const rejected = await apply(t, "p2@example.nz");
    await t.run((ctx) => ctx.db.patch(rejected.providerId, { reviewedAt: 1, rejectionReason: "x" }));
    await createProvider(t); // approved, unowned seed-style listing
    const rows = await admin.query(api.admin.listPending, {});
    expect(rows.map((r) => r._id)).toEqual([pending.providerId]);
    expect(rows[0].ownerEmail).toBe("p1@example.nz");
  });
});

describe("admin.review", () => {
  test("approving makes the listing public", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    await admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "approve" });
    expect((await u.query(api.providers.mine, {}))?.status).toBe("approved");
    expect((await t.query(api.providers.list, {})).map((p) => p._id)).toEqual([providerId]);
  });

  test("rejecting needs a reason, hides the listing, and keeps the reason", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    await expect(admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "reject" })).rejects.toThrow("reason is required");
    await expect(admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "reject", reason: "   " })).rejects.toThrow("reason is required");
    await admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "reject", reason: "Please add a photo" });
    const mine = await u.query(api.providers.mine, {});
    expect(mine).toMatchObject({ status: "rejected", rejectionReason: "Please add a photo" });
    expect(await t.query(api.providers.list, {})).toEqual([]);
  });

  test("a decision cannot be repeated, and unowned seed listings cannot be reviewed", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { providerId } = await apply(t);
    await admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "approve" });
    await expect(admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "reject", reason: "oops" })).rejects.toThrow("Already reviewed");
    const seeded = await createProvider(t);
    await expect(admin.mutation(api.admin.review, { providerId: seeded, submittedAt: 0, decision: "reject", reason: "x" })).rejects.toThrow("Already reviewed");
  });

  test("reject, resubmit, approve completes the loop", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    await admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "reject", reason: "Add a photo" });
    await u.mutation(api.providers.submitProfile, profile);
    expect((await admin.query(api.admin.listPending, {})).map((r) => r._id)).toEqual([providerId]);
    await admin.mutation(api.admin.review, { providerId, submittedAt: await stamp(t, providerId), decision: "approve" });
    expect((await u.query(api.providers.mine, {}))?.status).toBe("approved");
  });

  test("an application edited after the admin loaded it cannot be approved", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    const seen = await stamp(t, providerId); // what the admin's page rendered
    await u.mutation(api.providers.submitProfile, { ...profile, category: "gardening", name: "Changed" });
    await expect(admin.mutation(api.admin.review, { providerId, submittedAt: seen, decision: "approve" })).rejects.toThrow("This application changed");
    expect((await u.query(api.providers.mine, {}))?.status).toBe("pending");
    expect(await t.query(api.providers.list, {})).toEqual([]);
  });

  test("an application edited after the admin loaded it cannot be rejected either", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    const seen = await stamp(t, providerId);
    await u.mutation(api.providers.submitProfile, { ...profile, bio: "Something else entirely" });
    await expect(admin.mutation(api.admin.review, { providerId, submittedAt: seen, decision: "reject", reason: "no" })).rejects.toThrow("This application changed");
    expect((await u.query(api.providers.mine, {}))?.status).toBe("pending");
  });

  test("after a resubmit, approving the new version succeeds", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    const first = await stamp(t, providerId);
    await u.mutation(api.providers.submitProfile, { ...profile, bio: "Updated bio" });
    const second = await stamp(t, providerId);
    expect(second).toBeGreaterThan(first);
    await admin.mutation(api.admin.review, { providerId, submittedAt: second, decision: "approve" });
    expect((await u.query(api.providers.mine, {}))?.status).toBe("approved");
  });

  test("an admin cannot review their own application", async () => {
    const t = newT();
    const { u, userId, providerId } = await apply(t);
    await t.run((ctx) => ctx.db.patch(userId, { role: "admin" }));
    const submittedAt = await stamp(t, providerId);
    await expect(u.mutation(api.admin.review, { providerId, submittedAt, decision: "approve" })).rejects.toThrow("You can't review your own application");
    expect(await t.query(api.providers.list, {})).toEqual([]);
  });
});

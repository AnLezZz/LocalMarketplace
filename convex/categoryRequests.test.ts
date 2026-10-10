import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { findDuplicates } from "./model/categories";
import type { Doc, Id } from "./_generated/dataModel";

const ask = { name: "Window tinting", description: "Tinting for car and home windows.", suggestedParentSlug: "car detailing" };
const service = { name: "Tint a car", description: "", priceType: "fixed" as const, priceCents: 15000, durationMinutes: 120 };

async function world() {
  const t = newT();
  const admin = asUser(t, await createUser(t, "admin"));
  await admin.mutation(api.categories.initDefaults, {});
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { category: "car detailing", approved: false }); // an application still under review
  const owner = asUser(t, ownerId);
  const otherOwnerId = await createUser(t, "provider");
  const otherProviderId = await createProvider(t, otherOwnerId);
  const other = asUser(t, otherOwnerId);
  const customer = asUser(t, await createUser(t, "customer"));
  const categories = async () => (await t.query(api.categories.list, {})).categories;
  /** The saved id of a category, by its key. */
  const idOf = async (slug: string) => (await categories()).find((c) => c.slug === slug)!._id as Id<"categories">;
  const row = async (id: string) => (await t.run((ctx) => ctx.db.get(id as never))) as Doc<"categoryRequests">;
  return { t, admin, owner, ownerId, providerId, other, otherProviderId, customer, categories, idOf, row };
}

const row = (label: string, extra: Partial<Doc<"categories">> = {}) => ({ slug: label.toLowerCase(), label, _id: label, enabled: true, ...extra }) as unknown as Doc<"categories">;

describe("duplicate detection", () => {
  test("exact ignores case, spacing and punctuation", () => {
    const rows = [row("Window cleaning"), row("Pet care")];
    expect(findDuplicates(rows, "  WINDOW-cleaning ").exact.map((r) => r.label)).toEqual(["Window cleaning"]);
    expect(findDuplicates(rows, "Pet  Care!").exact).toHaveLength(1);
  });
  test("similar catches containment, shared words and typos", () => {
    const rows = [row("Lawn mowing"), row("Dog walking"), row("Hair colouring")];
    expect(findDuplicates(rows, "Lawn mowing service").similar.map((r) => r.label)).toContain("Lawn mowing");
    expect(findDuplicates(rows, "Walking dogs").similar.map((r) => r.label)).toContain("Dog walking");
    expect(findDuplicates(rows, "Lawn mowng").similar.map((r) => r.label)).toContain("Lawn mowing");
    expect(findDuplicates(rows, "Hair colouring").exact).toHaveLength(1);
  });
  test("unrelated names match nothing", () => {
    const d = findDuplicates([row("Cleaning"), row("Gardening"), row("Handyman")], "Window tinting");
    expect(d.exact).toEqual([]);
    expect(d.similar).toEqual([]);
  });
});

describe("categoryRequests.submit", () => {
  test("a provider whose application is still under review can ask, and then track it", async () => {
    const w = await world();
    const r = await w.owner.mutation(api.categoryRequests.submit, ask);
    expect(r.similar).toEqual([]);
    const mine = await w.owner.query(api.categoryRequests.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "Window tinting", status: "pending", suggestedParentLabel: "Car detailing" });
  });

  test("needs a signed-in provider", async () => {
    const w = await world();
    await expect(w.t.mutation(api.categoryRequests.submit, ask)).rejects.toThrow("Sign in required");
    await expect(w.customer.mutation(api.categoryRequests.submit, ask)).rejects.toThrow("Create your provider profile first");
  });

  test("a suspended account cannot ask", async () => {
    const w = await world();
    await w.t.run((ctx) => ctx.db.patch(w.ownerId, { suspendedAt: Date.now() }));
    await expect(w.owner.mutation(api.categoryRequests.submit, ask)).rejects.toThrow("suspended");
  });

  test("validates the name, description and parent", async () => {
    const w = await world();
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: " " })).rejects.toThrow("name");
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "x".repeat(41) })).rejects.toThrow("under 40");
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, description: "short" })).rejects.toThrow("sentence");
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, description: "x".repeat(501) })).rejects.toThrow("under 500");
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, suggestedParentSlug: "nope" })).rejects.toThrow("parent");
  });

  test("refuses a category that already exists, whatever the spacing or case", async () => {
    const w = await world();
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "pet  CARE" })).rejects.toThrow('"Pet care" is already a category');
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Car-Detailing" })).rejects.toThrow("already a category");
  });

  test("allows a similar one but tells the provider what it resembles", async () => {
    const w = await world();
    const r = await w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Car detail" });
    expect(r.similar.map((c: { label: string }) => c.label)).toContain("Car detailing");
  });

  test("no repeat of an open request, and at most five open at once", async () => {
    const w = await world();
    await w.owner.mutation(api.categoryRequests.submit, ask);
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "window  TINTING" })).rejects.toThrow("already asked");
    for (const n of ["Roof painting", "Chimney sweeping", "Pool care", "Snow clearing"]) await w.owner.mutation(api.categoryRequests.submit, { ...ask, name: n });
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Tree surgery" })).rejects.toThrow("5 requests");
  });
});

describe("tenant ownership", () => {
  test("another provider cannot see, answer or attach a service to my request", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    expect(await w.other.query(api.categoryRequests.listMine, {})).toEqual([]);
    await w.t.run((ctx) => ctx.db.patch(id, { status: "more_info", adminNote: "What do you tint?" }));
    await expect(w.other.mutation(api.categoryRequests.reply, { requestId: id, message: "Cars and houses" })).rejects.toThrow("Request not found");
    await expect(w.other.mutation(api.services.create, { ...service, categoryRequestId: id })).rejects.toThrow("Category request not found");
    expect((await w.row(id)).status).toBe("more_info");
  });

  test("only admins can read or decide the queue", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    for (const who of [w.owner, w.customer, w.other]) {
      await expect(who.query(api.categoryRequests.listForAdmin, { view: "open" })).rejects.toThrow("Not allowed");
      await expect(who.query(api.categoryRequests.openCount, {})).rejects.toThrow("Not allowed");
      await expect(who.mutation(api.categoryRequests.decide, { requestId: id, decision: "reject", note: "no thanks please" })).rejects.toThrow("Not allowed");
    }
    expect((await w.row(id)).status).toBe("pending");
  });
});

describe("categoryRequests.decide", () => {
  test("approve creates the category under the suggested parent, lists the provider, and attaches the draft service without publishing it", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    const draft = await w.owner.mutation(api.services.create, { ...service, categoryRequestId: id });
    const res = await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "approve", icon: "car", hue: "car" });
    expect(res).toEqual({ status: "approved", categorySlug: "car detailing window tinting" });

    const created = (await w.categories()).find((c: { slug: string }) => c.slug === "car detailing window tinting");
    expect(created).toMatchObject({ label: "Window tinting", parentSlug: "car detailing", depth: 1, featured: false, active: true });

    const provider = (await w.t.run((ctx) => ctx.db.get(w.providerId)))!;
    expect(provider.categorySlugs).toContain("car detailing window tinting");
    const svc = (await w.t.run((ctx) => ctx.db.get(draft)))!;
    expect(svc.categorySlug).toBe("car detailing window tinting");
    expect(svc.enabled).toBe(false); // never auto-published
    expect(await w.t.query(api.services.listForProvider, { providerId: w.providerId })).toEqual([]);

    expect(await w.owner.query(api.categoryRequests.listMine, {})).toMatchObject([{ status: "approved", resolvedCategoryLabel: "Window tinting" }]);
    const audits = await w.t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audits.some((a) => a.action === "category_request.approve" && a.targetId === id)).toBe(true);
    const notes = await w.t.run((ctx) => ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", w.ownerId)).collect());
    expect(notes).toMatchObject([{ kind: "category_request_decided", read: false }]);
    expect(notes[0].title).toContain("Window tinting");
  });

  test("approve can override the name and parent, and refuses a same-named sibling", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Tinting" });
    const gardening = await w.idOf("gardening");
    const res = await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "approve", label: "Greenhouse care", parentId: gardening, icon: "leaf", hue: "gardening" });
    expect(res.categorySlug).toBe("gardening greenhouse care");

    const second = (await w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Pool care" })).id;
    await w.admin.mutation(api.categoryRequests.decide, { requestId: second, decision: "approve", icon: "tag", hue: "neutral" });
    // The same name is already a main category now: a request is refused up front, so an admin cannot be asked to duplicate it.
    await expect(w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Pool care" })).rejects.toThrow("already a category");
  });

  test("approve is refused when that exact name already sits in the same place", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Window tinting", suggestedParentSlug: undefined });
    await w.admin.mutation(api.categories.create, { label: "Window tinting", icon: "tag", hue: "neutral" }); // added by hand after the request
    await expect(w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "approve" })).rejects.toThrow("already exists there");
    expect((await w.row(id)).status).toBe("pending");
    const queue = await w.admin.query(api.categoryRequests.listForAdmin, { view: "open" });
    expect(queue[0].matches[0]).toMatchObject({ label: "Window tinting", exact: true });
  });

  test("assign maps the request onto an existing category and links the provider", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, { ...ask, name: "Car valet" });
    const draft = await w.owner.mutation(api.services.create, { ...service, categoryRequestId: id });
    const res = await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "assign", categorySlug: "car detailing", note: "We call this car detailing." });
    expect(res).toEqual({ status: "assigned", categorySlug: "car detailing" });
    expect((await w.t.run((ctx) => ctx.db.get(draft)))!.categorySlug).toBe("car detailing");
    expect(await w.owner.query(api.categoryRequests.listMine, {})).toMatchObject([{ status: "assigned", resolvedCategoryLabel: "Car detailing", adminNote: "We call this car detailing." }]);
    expect((await w.categories()).filter((c: { label: string }) => c.label === "Car valet")).toEqual([]); // nothing was created
  });

  test("assign refuses a missing or disabled category", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    await expect(w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "assign", categorySlug: "nope" })).rejects.toThrow("existing, enabled");
    const gardening = await w.idOf("gardening");
    await w.admin.mutation(api.categories.setEnabled, { id: gardening, enabled: false });
    await expect(w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "assign", categorySlug: "gardening" })).rejects.toThrow("existing, enabled");
  });

  test("more information: asks, the provider replies, it returns to pending, then it can be approved", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    await expect(w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "more_info" })).rejects.toThrow("what you need");
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "more_info", note: "Do you tint homes as well as cars?" });
    expect(await w.owner.query(api.categoryRequests.listMine, {})).toMatchObject([{ status: "more_info", adminNote: "Do you tint homes as well as cars?" }]);
    await expect(w.owner.mutation(api.categoryRequests.reply, { requestId: id, message: " " })).rejects.toThrow("Write your answer");
    await w.owner.mutation(api.categoryRequests.reply, { requestId: id, message: "Yes, both." });
    expect(await w.owner.query(api.categoryRequests.listMine, {})).toMatchObject([{ status: "pending", providerReply: "Yes, both." }]);
    await expect(w.owner.mutation(api.categoryRequests.reply, { requestId: id, message: "Again" })).rejects.toThrow("not waiting");
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "approve" });
    expect((await w.row(id)).status).toBe("approved");
  });

  test("reject needs a reason, tells the provider, and leaves the service without a category", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    const draft = await w.owner.mutation(api.services.create, { ...service, categoryRequestId: id });
    await expect(w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "reject" })).rejects.toThrow("reason");
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "reject", note: "Not something we list." });
    expect(await w.owner.query(api.categoryRequests.listMine, {})).toMatchObject([{ status: "rejected", adminNote: "Not something we list." }]);
    const svc = (await w.t.run((ctx) => ctx.db.get(draft)))!;
    expect(svc.categorySlug).toBeUndefined();
    expect(svc.enabled).toBe(false);
    expect((await w.t.run((ctx) => ctx.db.get(w.providerId)))!.categorySlugs ?? []).not.toContain("window tinting");
  });

  test("a decided request cannot be decided again", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "reject", note: "Not something we list." });
    await expect(w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "approve" })).rejects.toThrow("already been decided");
  });

  test("the admin queue shows the provider, matches and how many others asked for the same thing", async () => {
    const w = await world();
    await w.owner.mutation(api.categoryRequests.submit, ask);
    await w.other.mutation(api.categoryRequests.submit, { ...ask, name: "window tinting" });
    const open = await w.admin.query(api.categoryRequests.listForAdmin, { view: "open" });
    expect(open).toHaveLength(2);
    expect(open[0]).toMatchObject({ providerName: "Test Provider", suggestedParentLabel: "Car detailing", othersAsking: 1, status: "pending" });
    expect(await w.admin.query(api.categoryRequests.openCount, {})).toBe(2);
    expect(await w.admin.query(api.categoryRequests.listForAdmin, { view: "decided" })).toEqual([]);
  });
});

describe("service drafts waiting on a category", () => {
  test("cannot be turned on until the request is approved, and approval does not turn it on", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    const draft = await w.owner.mutation(api.services.create, { ...service, categoryRequestId: id });
    expect((await w.t.run((ctx) => ctx.db.get(draft)))!.enabled).toBe(false);
    await expect(w.owner.mutation(api.services.setEnabled, { id: draft, enabled: true })).rejects.toThrow("waiting on your category request");
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "approve" });
    expect((await w.t.run((ctx) => ctx.db.get(draft)))!.enabled).toBe(false);
    await w.owner.mutation(api.services.setEnabled, { id: draft, enabled: true }); // the provider's own choice
    expect((await w.t.run((ctx) => ctx.db.get(draft)))!.enabled).toBe(true);
    // Still not public: the provider's application has not been approved.
    expect(await w.t.query(api.services.listForProvider, { providerId: w.providerId })).toEqual([]);
  });

  test("after a rejection it stays off until the provider picks a category", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    const draft = await w.owner.mutation(api.services.create, { ...service, categoryRequestId: id });
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "reject", note: "Not something we list." });
    await expect(w.owner.mutation(api.services.setEnabled, { id: draft, enabled: true })).rejects.toThrow("declined");
    await w.owner.mutation(api.services.update, { id: draft, ...service, categorySlug: "car detailing" });
    await w.owner.mutation(api.services.setEnabled, { id: draft, enabled: true });
    expect((await w.t.run((ctx) => ctx.db.get(draft)))).toMatchObject({ enabled: true, categorySlug: "car detailing" });
  });

  test("a category and a request cannot both be given, and only an open request can be used", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    await expect(w.owner.mutation(api.services.create, { ...service, categorySlug: "car detailing", categoryRequestId: id })).rejects.toThrow("not both");
    await w.admin.mutation(api.categoryRequests.decide, { requestId: id, decision: "reject", note: "Not something we list." });
    await expect(w.owner.mutation(api.services.create, { ...service, categoryRequestId: id })).rejects.toThrow("has been decided");
  });

  test("editing a draft keeps its link to the request", async () => {
    const w = await world();
    const { id } = await w.owner.mutation(api.categoryRequests.submit, ask);
    const draft = await w.owner.mutation(api.services.create, { ...service, categoryRequestId: id });
    await w.owner.mutation(api.services.update, { id: draft, ...service, name: "Tint any car" });
    expect(await w.t.run((ctx) => ctx.db.get(draft))).toMatchObject({ name: "Tint any car", categoryRequestId: id, enabled: false });
  });
});

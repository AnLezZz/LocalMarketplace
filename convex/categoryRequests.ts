import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireRole, requireUser } from "./model/auth";
import { audit } from "./model/audit";
import { notify } from "./model/notify";
import { requireOwnProvider } from "./model/services";
import { activeRows, findDuplicates, insertCategory, loadCategoryRows, MAX_PROVIDER_CATEGORIES, slugify } from "./model/categories";

/** pending -> approved | assigned | more_info | rejected. more_info -> pending (the provider replied) or any decision. The other three are final. */
export type RequestStatus = Doc<"categoryRequests">["status"];
const OPEN: RequestStatus[] = ["pending", "more_info"];
const MAX_OPEN_PER_PROVIDER = 5;
const HREF = "/provider/category-requests";

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** A category's display name from its key, falling back to the key for one that no longer exists. */
const labelOf = (rows: Doc<"categories">[], slug?: string) => (slug ? rows.find((r) => r.slug === slug)?.label ?? slug : undefined);

// ---------- provider side (tenant-scoped: everything goes through the caller's own provider) ----------

async function ownProvider(ctx: Parameters<typeof requireOwnProvider>[0]) {
  await requireUser(ctx); // signed in, and the account is not suspended
  const provider = await requireOwnProvider(ctx);
  if (provider.suspendedAt !== undefined) throw new ConvexError("This listing is suspended. Contact support.");
  return provider;
}

/** A request another provider owns looks exactly like one that does not exist. */
async function ownRequest(ctx: MutationCtx, provider: Doc<"providers">, id: string) {
  const requestId = ctx.db.normalizeId("categoryRequests", id);
  const request = requestId ? await ctx.db.get(requestId) : null;
  if (!request || request.providerId !== provider._id) throw new ConvexError("Request not found");
  return request;
}

/**
 * Asks for a category that is not in the list. Works for a provider whose application is still waiting for review, so they carry on
 * with their profile meanwhile. Refuses a name that already exists; a similar one is allowed and the admin sees it.
 */
export const submit = mutation({
  args: { name: v.string(), description: v.string(), suggestedParentSlug: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const provider = await ownProvider(ctx);
    const name = clean(a.name), description = a.description.trim();
    if (name.length < 2) throw new ConvexError("Give the category a name");
    if (name.length > 40) throw new ConvexError("Keep the name under 40 characters");
    if (description.length < 10) throw new ConvexError("Describe the service in a sentence or two");
    if (description.length > 500) throw new ConvexError("Keep the description under 500 characters");
    const slug = slugify(name);
    if (!slug) throw new ConvexError("Use letters or numbers in the name");

    const rows = await loadCategoryRows(ctx);
    const parentSlug = a.suggestedParentSlug?.trim() || undefined;
    if (parentSlug && !activeRows(rows).some((r) => r.slug === parentSlug)) throw new ConvexError("Choose a parent category from the list");

    const { exact, similar } = findDuplicates(rows, name);
    if (exact.length > 0) throw new ConvexError(`"${exact[0].label}" is already a category. Choose it from the list instead.`);

    const mine = await ctx.db.query("categoryRequests").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).take(100);
    const open = mine.filter((r) => OPEN.includes(r.status));
    if (open.some((r) => r.slug === slug)) throw new ConvexError("You have already asked for that category");
    if (open.length >= MAX_OPEN_PER_PROVIDER) throw new ConvexError(`You can have ${MAX_OPEN_PER_PROVIDER} requests open at once. Wait for a decision first.`);

    const id = await ctx.db.insert("categoryRequests", {
      providerId: provider._id, name, slug, description, status: "pending", updatedAt: Date.now(),
      ...(parentSlug ? { suggestedParentSlug: parentSlug } : {}),
    });
    return { id, similar: similar.slice(0, 5).map((r) => ({ slug: r.slug, label: r.label })) };
  },
});

/** The caller's own requests, newest first, with where each one stands. Reactive, so a decision appears without a reload. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    let provider;
    try { provider = await requireOwnProvider(ctx); } catch { return []; }
    const rows = await loadCategoryRows(ctx);
    const mine = await ctx.db.query("categoryRequests").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).order("desc").take(50);
    return mine.map((r) => ({
      _id: r._id, name: r.name, description: r.description, status: r.status,
      suggestedParentSlug: r.suggestedParentSlug, suggestedParentLabel: labelOf(rows, r.suggestedParentSlug),
      resolvedCategorySlug: r.resolvedCategorySlug, resolvedCategoryLabel: labelOf(rows, r.resolvedCategorySlug),
      adminNote: r.adminNote, providerReply: r.providerReply, submittedAt: r._creationTime, updatedAt: r.updatedAt,
    }));
  },
});

/** Answers an admin's "more information required" and puts the request back in their queue. */
export const reply = mutation({
  args: { requestId: v.string(), message: v.string() },
  handler: async (ctx, a) => {
    const provider = await ownProvider(ctx);
    const request = await ownRequest(ctx, provider, a.requestId);
    if (request.status !== "more_info") throw new ConvexError("This request is not waiting for more information");
    const message = a.message.trim();
    if (message.length < 2) throw new ConvexError("Write your answer first");
    if (message.length > 500) throw new ConvexError("Keep the answer under 500 characters");
    await ctx.db.patch(request._id, { status: "pending", providerReply: message, updatedAt: Date.now() });
  },
});

// ---------- admin side ----------

/**
 * The queue. `open` is what needs a decision (oldest first), `decided` is the recent history. Each row carries the existing categories
 * it could duplicate and how many other providers asked for the same thing, so the admin can map instead of creating a near-copy.
 */
export const listForAdmin = query({
  args: { view: v.union(v.literal("open"), v.literal("decided")) },
  handler: async (ctx, { view }) => {
    await requireRole(ctx, "admin");
    const statuses: RequestStatus[] = view === "open" ? ["pending", "more_info"] : ["approved", "assigned", "rejected"];
    const found = (await Promise.all(statuses.map((s) => ctx.db.query("categoryRequests").withIndex("by_status", (q) => q.eq("status", s)).take(100)))).flat();
    found.sort((x, y) => (view === "open" ? x._creationTime - y._creationTime : y.updatedAt - x.updatedAt));
    const rows = await loadCategoryRows(ctx);
    const usable = activeRows(rows);
    const sameName = new Map<string, number>();
    if (view === "open") for (const r of found) sameName.set(r.slug, (sameName.get(r.slug) ?? 0) + 1);
    return await Promise.all(found.slice(0, 100).map(async (r) => {
      const provider = await ctx.db.get(r.providerId);
      const owner = provider?.userId ? await ctx.db.get(provider.userId) : null;
      const { exact, similar } = findDuplicates(rows, r.name);
      return {
        _id: r._id, name: r.name, description: r.description, status: r.status, submittedAt: r._creationTime, updatedAt: r.updatedAt,
        providerId: r.providerId, providerName: provider?.name ?? "Unknown provider", ownerEmail: owner?.email ?? null,
        providerApproved: provider?.approved ?? false,
        suggestedParentSlug: r.suggestedParentSlug, suggestedParentLabel: labelOf(rows, r.suggestedParentSlug),
        adminNote: r.adminNote, providerReply: r.providerReply, resolvedCategoryLabel: labelOf(rows, r.resolvedCategorySlug),
        // Anything that already exists with this name (it can appear if the category was added after the request) or something like it.
        matches: [...exact, ...similar].slice(0, 6).map((c) => ({ slug: c.slug, label: c.label, exact: exact.includes(c), active: usable.some((u) => u._id === c._id) })),
        othersAsking: Math.max(0, (sameName.get(r.slug) ?? 1) - 1),
      };
    }));
  },
});

/** How many requests are waiting on an admin, for the sidebar badge. */
export const openCount = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return (await ctx.db.query("categoryRequests").withIndex("by_status", (q) => q.eq("status", "pending")).take(100)).length;
  },
});

/** Lists the provider under the category, and attaches it to the services that were waiting on this request. Never turns a service on. */
async function linkProvider(ctx: MutationCtx, request: Doc<"categoryRequests">, slug: string) {
  const provider = await ctx.db.get(request.providerId);
  if (!provider) return null;
  const have = new Set([provider.category, ...(provider.categorySlugs ?? [])]);
  if (!have.has(slug) && have.size < MAX_PROVIDER_CATEGORIES) {
    await ctx.db.patch(provider._id, { categorySlugs: [...new Set([provider.category, ...(provider.categorySlugs ?? []), slug])] });
  }
  const services = await ctx.db.query("services").withIndex("by_provider", (q) => q.eq("providerId", provider._id)).take(100);
  // `enabled` is left as it is. The service was a draft; the provider decides when it goes live, and a public listing still needs an approved provider.
  for (const s of services) if (s.categoryRequestId === request._id && !s.archived) await ctx.db.patch(s._id, { categorySlug: slug });
  return provider;
}

const DONE_TEXT: Record<"approved" | "assigned" | "more_info" | "rejected", (name: string, label: string, note?: string) => { title: string; body: string }> = {
  approved: (name, label) => ({ title: `"${name}" is now a category`, body: `We added ${label} and listed you under it. Your service stays a draft until you turn it on.` }),
  assigned: (name, label) => ({ title: `"${name}" matches an existing category`, body: `We listed you under ${label}. Your service stays a draft until you turn it on.` }),
  more_info: (name, _l, note) => ({ title: `More information needed for "${name}"`, body: note ?? "Please answer our question." }),
  rejected: (name, _l, note) => ({ title: `Category request declined: "${name}"`, body: note ?? "We could not add this category." }),
};

/**
 * One decision on a request, by an admin: create the category (`approve`), map it to an existing one (`assign`), ask the provider a
 * question (`more_info`) or decline (`reject`). The status change, the category, the links, the audit entry and the provider's
 * notification all happen in this one transaction.
 */
export const decide = mutation({
  args: {
    requestId: v.id("categoryRequests"),
    decision: v.union(v.literal("approve"), v.literal("assign"), v.literal("more_info"), v.literal("reject")),
    note: v.optional(v.string()), // the reason, or the question
    categorySlug: v.optional(v.string()), // assign: which existing category
    label: v.optional(v.string()), icon: v.optional(v.string()), hue: v.optional(v.string()), // approve: the new category (defaults to the request)
    parentId: v.optional(v.id("categories")), featured: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const admin = await requireRole(ctx, "admin");
    const request = await ctx.db.get(a.requestId);
    if (!request) throw new ConvexError("Request not found");
    if (!OPEN.includes(request.status)) throw new ConvexError("This request has already been decided");
    const note = a.note ? clean(a.note) : undefined;
    if (note && note.length > 500) throw new ConvexError("Keep the message under 500 characters");
    const rows = await loadCategoryRows(ctx);

    let status: "approved" | "assigned" | "more_info" | "rejected";
    let resolved: { slug: string; label: string } | undefined;
    if (a.decision === "approve") {
      if (rows.length === 0) throw new ConvexError("Save the default categories first");
      const label = a.label ? clean(a.label) : request.name;
      const parent = a.parentId ?? (request.suggestedParentSlug ? rows.find((r) => r.slug === request.suggestedParentSlug)?._id : undefined);
      const { exact } = findDuplicates(rows, label);
      // A same-named category directly beside where this would go is a duplicate; the same name under another parent is allowed.
      if (exact.some((r) => r.parentId === parent)) throw new ConvexError(`"${exact[0].label}" already exists there. Assign the request to it instead.`);
      const made = await insertCategory(ctx, rows, { label, icon: a.icon ?? "tag", hue: a.hue ?? "neutral", parentId: parent, featured: a.featured });
      resolved = { slug: made.slug, label: made.label };
      status = "approved";
    } else if (a.decision === "assign") {
      const target = rows.find((r) => r.slug === a.categorySlug);
      if (!target || !activeRows(rows).some((r) => r._id === target._id)) throw new ConvexError("Choose an existing, enabled category");
      resolved = { slug: target.slug, label: target.label };
      status = "assigned";
    } else if (a.decision === "more_info") {
      if (!note || note.length < 5) throw new ConvexError("Say what you need to know");
      status = "more_info";
    } else {
      if (!note || note.length < 5) throw new ConvexError("Give the provider a reason");
      status = "rejected";
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status, adminNote: note, decidedBy: admin._id, decidedAt: now, updatedAt: now,
      ...(resolved ? { resolvedCategorySlug: resolved.slug } : {}),
    });
    const provider = resolved ? await linkProvider(ctx, request, resolved.slug) : await ctx.db.get(request.providerId);
    await audit(ctx, admin._id, `category_request.${a.decision}`, "categoryRequest", request._id, [request.name, resolved && `-> ${resolved.label}`, note].filter(Boolean).join(" | "));
    const text = DONE_TEXT[status](request.name, resolved?.label ?? "", note);
    await notify(ctx, provider?.userId, { kind: "category_request_decided", ...text, href: HREF });
    return { status, categorySlug: resolved?.slug ?? null };
  },
});

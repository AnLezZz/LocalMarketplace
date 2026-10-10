import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { canTransition, type Actor } from "./model/bookingRules";
import { getProviderForUser } from "./model/providers";
import { notify } from "./model/notify";
import { withdrawPendingReschedules } from "./model/reschedules";
import { latestDispute } from "./model/disputes";
import { latestReschedule } from "./model/reschedules";
import { providerMaySeePrivate, servesSuburb, validateJob } from "./model/jobDetails";
import { snapshotPrice, validateQuote, type PriceType } from "./model/pricing";
import { isTimeAvailable } from "./model/availability";
import { requireSupportedSuburb } from "./model/locations";

export const create = mutation({
  args: {
    providerId: v.id("providers"), customerName: v.string(), description: v.string(),
    startsAt: v.number(), endsAt: v.number(), serviceId: v.optional(v.id("services")),
    address: v.string(), suburb: v.string(), accessNotes: v.optional(v.string()),
    shareContact: v.optional(v.boolean()), phone: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    if (!user.email) throw new ConvexError("Your account needs an email address");
    const provider = await ctx.db.get(a.providerId);
    if (!provider?.approved) throw new ConvexError("provider not found");
    if (provider.userId === user._id) throw new ConvexError("You can't book yourself");
    if (!(a.endsAt > a.startsAt) || a.startsAt < Date.now()) throw new ConvexError("invalid time window");
    const customerName = a.customerName.trim();
    const description = a.description.trim();
    if (!customerName || !description) throw new ConvexError("missing fields");
    if (customerName.length > 100 || description.length > 2000) throw new ConvexError("One of the fields is too long");
    const job = validateJob({ address: a.address, suburb: a.suburb, accessNotes: a.accessNotes, shareContact: a.shareContact ?? false, phone: a.phone });
    await requireSupportedSuburb(ctx, job.suburb, (s) => `We don't operate in ${s} yet`);
    if (!servesSuburb(provider, job.suburb)) throw new ConvexError(`${provider.name} doesn't service ${job.suburb}`);
    // Refuse times the provider has closed or blocked. Providers who never set hours are only checked
    // against blocked time and accepted bookings, so existing listings keep working.
    if (!(await isTimeAvailable(ctx, provider._id, a.startsAt, a.endsAt))) throw new ConvexError("That time isn't available");
    let service: { _id: typeof a.serviceId; name: string; priceType: PriceType; priceCents?: number } | null = null;
    if (a.serviceId) {
      const s = await ctx.db.get(a.serviceId);
      if (!s || s.providerId !== provider._id || !s.enabled || s.archived) throw new ConvexError("service not found");
      service = { _id: s._id, name: s.name, priceType: s.priceType, priceCents: s.priceCents };
    }
    const id = await ctx.db.insert("bookings", {
      ...(service ? { serviceId: service._id, serviceName: service.name } : {}),
      ...(service ? snapshotPrice(service.priceType, service.priceCents, a.startsAt, a.endsAt) : snapshotPrice(provider.rateBasis, provider.rateCents, a.startsAt, a.endsAt)),
      providerId: provider._id, customerId: user._id, customerName, customerEmail: user.email,
      description, startsAt: a.startsAt, endsAt: a.endsAt, status: "requested", ...job,
    });
    await ctx.db.insert("bookingEvents", { bookingId: id, actorId: user._id, toStatus: "requested" });
    await notify(ctx, provider.userId, { kind: "booking_requested", title: "New booking request", body: `${customerName} asked for ${service?.name ?? "a booking"}.`, href: `/provider/bookings/${id}` });
    return id;
  },
});

/** Requests for the signed-in user's own provider profile. */
export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const provider = await getProviderForUser(ctx, user._id);
    if (!provider) return [];
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_provider", (i) => i.eq("providerId", provider._id))
      .order("desc")
      .take(200);
    // A list never carries contact details or the street address; the detail view applies the rules.
    return rows.map((b) => ({
      _id: b._id, _creationTime: b._creationTime, providerId: b.providerId, customerName: b.customerName, description: b.description,
      startsAt: b.startsAt, endsAt: b.endsAt, status: b.status, serviceName: b.serviceName, suburb: b.suburb,
      priceType: b.priceType, estimateCents: b.estimateCents, quoteStatus: b.quoteStatus, quoteCents: b.quoteCents,
    }));
  },
});

/** Bookings the signed-in user has requested as a customer. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_customerId", (i) => i.eq("customerId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (b) => ({ ...b, providerName: (await ctx.db.get(b.providerId))?.name ?? "Unknown provider" })),
    );
  },
});

/** Convex mutations are serializable transactions, so the overlap check + write below is atomic. */
export const transition = mutation({
  args: {
    bookingId: v.id("bookings"),
    to: v.union(v.literal("accepted"), v.literal("declined"), v.literal("cancelled"), v.literal("completed")),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(a.bookingId);
    if (!b) return { ok: false as const, reason: "not found" };
    const provider = await ctx.db.get(b.providerId);
    const actor: Actor | null =
      provider?.userId === user._id ? "provider" : b.customerId === user._id ? "customer" : null;
    // Strangers learn nothing about whether the booking exists.
    if (!actor) return { ok: false as const, reason: "not found" };
    if (!canTransition(actor, b.status, a.to)) {
      return { ok: false as const, reason: `cannot go ${b.status} → ${a.to}` };
    }
    if (a.to === "accepted" && !provider?.approved) return { ok: false as const, reason: "Your listing is not currently active" };
    if (a.to === "accepted" && b.priceType === "quote" && b.quoteStatus !== "accepted") {
      return { ok: false as const, reason: "Send a quote and wait for the customer to accept it first" };
    }
    if (a.to === "accepted") {
      // Exact, not bounded: a bounded read could miss a conflict and double-book. The index range
      // keeps it to this provider's accepted/completed rows that end after the new start.
      let clash = false;
      for (const status of ["accepted", "completed"] as const) {
        for await (const o of ctx.db.query("bookings").withIndex("by_provider_and_status_and_endsAt", (i) =>
          i.eq("providerId", b.providerId).eq("status", status).gt("endsAt", b.startsAt))) {
          if (o._id !== b._id && o.startsAt < b.endsAt) { clash = true; break; }
        }
        if (clash) break;
      }
      if (clash) return { ok: false as const, reason: "time conflicts with another accepted booking" };
    }
    await ctx.db.patch(b._id, { status: a.to, ...(a.to === "accepted" ? { agreedCents: b.priceType === "quote" ? b.quoteCents : b.estimateCents } : {}) });
    await ctx.db.insert("bookingEvents", { bookingId: b._id, actorId: user._id, fromStatus: b.status, toStatus: a.to });
    if (a.to === "cancelled" || a.to === "completed") await withdrawPendingReschedules(ctx, b._id);
    const what = b.serviceName ?? "your booking";
    if (actor === "customer") {
      await notify(ctx, provider?.userId, { kind: "booking_cancelled", title: "Booking cancelled", body: `${b.customerName} cancelled ${what}.`, href: `/provider/bookings/${b._id}` });
    } else {
      const text = {
        accepted: ["Booking accepted", `${provider?.name} accepted ${what}.`, "/bookings"],
        declined: ["Booking declined", `${provider?.name} can't take ${what}.`, "/bookings?tab=cancelled"],
        cancelled: ["Booking cancelled", `${provider?.name} cancelled ${what}.`, "/bookings?tab=cancelled"],
        completed: ["Job completed", `${provider?.name} marked ${what} as done. How did it go?`, `/bookings/${b._id}/review`],
      }[a.to];
      await notify(ctx, b.customerId, { kind: `booking_${a.to}`, title: text[0], body: text[1], href: text[2] });
    }
    return { ok: true as const };
  },
});

/** One booking on the signed-in user's own provider profile. Null for anyone else, so existence is not revealed. */
export const getForProvider = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const provider = await getProviderForUser(ctx, user._id);
    const bookingId = ctx.db.normalizeId("bookings", id);
    const b = provider && bookingId ? await ctx.db.get(bookingId) : null;
    if (!b || !provider || b.providerId !== provider._id) return null;
    const events = await ctx.db.query("bookingEvents").withIndex("by_booking", (i) => i.eq("bookingId", b._id)).take(50);
    const open = providerMaySeePrivate(b.status);
    return {
      _id: b._id, customerName: b.customerName, description: b.description, startsAt: b.startsAt, endsAt: b.endsAt,
      status: b.status, serviceName: b.serviceName, suburb: b.suburb,
      priceType: b.priceType, unitCents: b.unitCents, estimateCents: b.estimateCents,
      quoteCents: b.quoteCents, quoteNote: b.quoteNote, quoteStatus: b.quoteStatus, agreedCents: b.agreedCents,
      // Full address and access notes only once accepted; contact only if the customer opted in.
      address: open ? b.address : undefined, accessNotes: open ? b.accessNotes : undefined,
      contact: open && b.shareContact ? { email: b.customerEmail, phone: b.customerPhone } : undefined,
      privateHidden: !open && !!b.address,
      dispute: await latestDispute(ctx, b._id), reschedule: await latestReschedule(ctx, b._id),
      events: events.map((e) => ({ at: e._creationTime, from: e.fromStatus, to: e.toStatus, byCustomer: e.actorId === b.customerId })),
    };
  },
});

/** One of the signed-in customer's own bookings, with everything they entered. Null for anyone else. */
export const getForCustomer = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await getUser(ctx);
    const bookingId = ctx.db.normalizeId("bookings", id);
    const b = user && bookingId ? await ctx.db.get(bookingId) : null;
    if (!b || !user || b.customerId !== user._id) return null;
    const provider = await ctx.db.get(b.providerId);
    const events = await ctx.db.query("bookingEvents").withIndex("by_booking", (i) => i.eq("bookingId", b._id)).take(50);
    const { customerEmail: _e, ...rest } = b;
    return {
      ...rest, providerName: provider?.name ?? "Unknown provider", providerSuburb: provider?.suburb, dispute: await latestDispute(ctx, b._id), reschedule: await latestReschedule(ctx, b._id),
      events: events.map((e) => ({ at: e._creationTime, to: e.toStatus, byProvider: e.actorId !== b.customerId })),
    };
  },
});

/** The provider offers (or revises) a quote on a quote-priced request. Not possible once the customer has accepted one. */
export const submitQuote = mutation({
  args: { bookingId: v.id("bookings"), amountCents: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(a.bookingId);
    const provider = b ? await ctx.db.get(b.providerId) : null;
    // Anyone but the owning provider learns nothing about the booking.
    if (!b || !provider || provider.userId !== user._id) throw new ConvexError("booking not found");
    if (b.priceType !== "quote") throw new ConvexError("This booking has a set price, so it doesn't need a quote");
    if (b.status !== "requested") throw new ConvexError("You can only quote a request that is still open");
    if (b.quoteStatus === "accepted") throw new ConvexError("The customer has already accepted your quote");
    const q = validateQuote(a.amountCents, a.note);
    await ctx.db.patch(b._id, { quoteCents: q.amountCents, quoteNote: q.note, quoteStatus: "offered" });
    await notify(ctx, b.customerId, { kind: "quote_offered", title: "You have a quote", body: `${provider.name} quoted $${q.amountCents / 100} for ${b.serviceName ?? "your booking"}.`, href: `/bookings/${b._id}` });
  },
});

/** The customer accepts or declines the offered quote. */
export const respondToQuote = mutation({
  args: { bookingId: v.id("bookings"), accept: v.boolean() },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(a.bookingId);
    if (!b || b.customerId !== user._id) throw new ConvexError("booking not found");
    if (b.status !== "requested") throw new ConvexError("This request is no longer open");
    if (b.quoteStatus !== "offered") throw new ConvexError("There is no quote to respond to");
    await ctx.db.patch(b._id, { quoteStatus: a.accept ? "accepted" : "declined" });
    const provider = await ctx.db.get(b.providerId);
    await notify(ctx, provider?.userId, {
      kind: a.accept ? "quote_accepted" : "quote_declined", title: a.accept ? "Quote accepted" : "Quote declined",
      body: a.accept ? `${b.customerName} accepted your $${(b.quoteCents ?? 0) / 100} quote. You can accept the booking now.` : `${b.customerName} declined your quote. You can send a new one.`,
      href: `/provider/bookings/${b._id}`,
    });
  },
});

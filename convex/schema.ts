import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("customer"), v.literal("provider"), v.literal("admin"));

export default defineSchema({
  ...authTables,
  // Replaces authTables.users to add `role`. The other fields mirror the library's table.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: roleValidator,
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  providers: defineTable({
    name: v.string(),
    bio: v.string(),
    category: v.string(),
    suburb: v.string(),
    rateCents: v.number(),
    rateBasis: v.union(v.literal("hourly"), v.literal("fixed")),
    ratingAvg: v.number(),
    reviewCount: v.number(),
    approved: v.boolean(),
    // Owner. Absent on seeded demo listings, which nobody can manage.
    userId: v.optional(v.id("users")),
    // Set by an admin decision. approved=false with reviewedAt set means rejected.
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    // Stamped on every submit/resubmit. An admin decision must quote it, so it binds to the version they read.
    submittedAt: v.optional(v.number()),
    // Path under /public (e.g. /images/alex_morgan.jpg). Set by seed only; there is no upload yet.
    photo: v.optional(v.string()),
  })
    .index("by_approved", ["approved"])
    .index("by_userId", ["userId"])
    .index("by_approved_and_reviewedAt", ["approved", "reviewedAt"]),

  bookings: defineTable({
    providerId: v.id("providers"),
    // Absent on bookings created before sign-in existed.
    customerId: v.optional(v.id("users")),
    customerName: v.string(),
    customerEmail: v.string(),
    description: v.string(),
    startsAt: v.number(), // UTC ms
    endsAt: v.number(), // UTC ms
    // The service requested, with its name copied so later edits or archiving do not rewrite history.
    serviceId: v.optional(v.id("services")),
    serviceName: v.optional(v.string()),
    status: v.union(
      v.literal("requested"), v.literal("accepted"), v.literal("declined"),
      v.literal("cancelled"), v.literal("completed"),
    ),
  })
    .index("by_provider", ["providerId"])
    .index("by_customerId", ["customerId"])
    // Overlap check on accept: only this provider's accepted/completed rows that end after the new start.
    .index("by_provider_and_status_and_endsAt", ["providerId", "status", "endsAt"]),

  services: defineTable({
    providerId: v.id("providers"),
    name: v.string(),
    description: v.string(),
    priceType: v.union(v.literal("fixed"), v.literal("hourly"), v.literal("quote")),
    // Absent for quote-required services.
    priceCents: v.optional(v.number()),
    durationMinutes: v.number(),
    enabled: v.boolean(),
    // Archived services stay for booking history but are hidden everywhere else.
    archived: v.boolean(),
  }).index("by_provider", ["providerId"]),

  // One row per weekday a provider has configured. No rows at all means "never configured": 8am-5pm every day.
  workingHours: defineTable({
    providerId: v.id("providers"),
    weekday: v.number(), // 0 = Sunday ... 6 = Saturday (Auckland)
    enabled: v.boolean(),
    startMinute: v.number(), // minutes after midnight, Auckland time
    endMinute: v.number(),
    breakStartMinute: v.optional(v.number()),
    breakEndMinute: v.optional(v.number()),
  }).index("by_provider", ["providerId"]),

  // Blocked time: holidays, unavailable dates, manual blocks. Absolute UTC instants.
  timeOff: defineTable({
    providerId: v.id("providers"),
    startsAt: v.number(),
    endsAt: v.number(),
    reason: v.optional(v.string()),
  }).index("by_provider_and_endsAt", ["providerId", "endsAt"]),

  favourites: defineTable({
    userId: v.id("users"),
    providerId: v.id("providers"),
  }).index("by_user", ["userId"]).index("by_user_and_provider", ["userId", "providerId"]),

  // One review per completed booking. Aggregates on `providers` are updated in the same mutation.
  reviews: defineTable({
    bookingId: v.id("bookings"),
    providerId: v.id("providers"),
    customerId: v.id("users"),
    customerName: v.string(),
    rating: v.number(),
    text: v.string(),
  }).index("by_booking", ["bookingId"]).index("by_provider", ["providerId"]).index("by_customer", ["customerId"]),

  bookingEvents: defineTable({
    bookingId: v.id("bookings"),
    actorId: v.optional(v.id("users")),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
  }).index("by_booking", ["bookingId"]),
});

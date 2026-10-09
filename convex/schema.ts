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
  }).index("by_approved", ["approved"]),

  bookings: defineTable({
    providerId: v.id("providers"),
    customerName: v.string(),
    customerEmail: v.string(),
    description: v.string(),
    startsAt: v.number(), // UTC ms
    endsAt: v.number(), // UTC ms
    status: v.union(
      v.literal("requested"), v.literal("accepted"), v.literal("declined"),
      v.literal("cancelled"), v.literal("completed"),
    ),
  }).index("by_provider", ["providerId"]),

  bookingEvents: defineTable({
    bookingId: v.id("bookings"),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
  }).index("by_booking", ["bookingId"]),
});

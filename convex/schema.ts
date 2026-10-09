import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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

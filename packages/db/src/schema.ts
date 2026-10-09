import { pgTable, uuid, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  bio: text("bio").notNull().default(""),
  category: text("category").notNull(),
  suburb: text("suburb").notNull(),
  rateCents: integer("rate_cents").notNull(),
  rateBasis: text("rate_basis").notNull().default("hourly"),
  ratingAvg: numeric("rating_avg").notNull().default("0"),
  reviewCount: integer("review_count").notNull().default(0),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  description: text("description").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("requested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingEvents = pgTable("booking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

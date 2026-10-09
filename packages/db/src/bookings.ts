import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { bookings, bookingEvents } from "./schema";

export const CATEGORIES = ["cleaning", "gardening", "handyman", "pet care", "car detailing", "moving help"] as const;

// requested → accepted/declined/cancelled; accepted → completed/cancelled
const TRANSITIONS: Record<string, string[]> = {
  requested: ["accepted", "declined", "cancelled"],
  accepted: ["completed", "cancelled"],
};

export async function createRequest(input: {
  providerId: string; customerName: string; customerEmail: string;
  description: string; startsAt: Date; endsAt: Date;
}) {
  const db = getDb();
  const [b] = await db.insert(bookings).values(input).returning();
  await db.insert(bookingEvents).values({ bookingId: b.id, toStatus: "requested" });
  return b;
}

/** Returns {ok:false, reason} on invalid transition or time conflict (enforced by DB exclusion constraint). */
export async function transition(bookingId: string, providerId: string, to: string) {
  const db = getDb();
  const [cur] = await db.select().from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.providerId, providerId)));
  if (!cur) return { ok: false as const, reason: "not found" };
  if (!TRANSITIONS[cur.status]?.includes(to)) return { ok: false as const, reason: `cannot go ${cur.status} → ${to}` };
  try {
    // conditional update on current status guards against races
    const [u] = await db.update(bookings).set({ status: to })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, cur.status))).returning();
    if (!u) return { ok: false as const, reason: "status changed, retry" };
  } catch (e: any) {
    if (e?.code === "23P01" || /no_overlap/.test(String(e?.message))) {
      return { ok: false as const, reason: "time conflicts with another accepted booking" };
    }
    throw e;
  }
  await db.insert(bookingEvents).values({ bookingId, fromStatus: cur.status, toStatus: to });
  return { ok: true as const };
}

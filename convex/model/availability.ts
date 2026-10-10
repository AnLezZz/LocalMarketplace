import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const TZ = "Pacific/Auckland";
export const DEFAULT_WINDOW: [number, number] = [8 * 60, 17 * 60];

/** Auckland's UTC offset in ms at an instant (handles daylight saving). */
function offsetMs(utcMs: number): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 0;
}

/** "2026-10-12" + minute 600 (Auckland wall time) -> UTC ms. */
export function localToUtc(date: string, minute: number): number {
  const guess = Date.parse(`${date}T00:00:00Z`) + minute * 60_000;
  return guess - offsetMs(guess - offsetMs(guess));
}

/** UTC ms -> Auckland { date: "YYYY-MM-DD", minute }. */
export function utcToLocal(utcMs: number): { date: string; minute: number } {
  const d = new Date(utcMs + offsetMs(utcMs));
  return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type HoursInput = { weekday: number; enabled: boolean; startMinute: number; endMinute: number; breakStartMinute?: number; breakEndMinute?: number };

export function validateHours(rows: HoursInput[]): HoursInput[] {
  const seen = new Set<number>();
  return rows.map((r) => {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6 || seen.has(r.weekday)) throw new ConvexError("Invalid weekday");
    seen.add(r.weekday);
    const ok = (m: number) => Number.isInteger(m) && m >= 0 && m <= 1440 && m % 15 === 0;
    if (!ok(r.startMinute) || !ok(r.endMinute)) throw new ConvexError("Times must be in 15 minute steps");
    if (r.enabled && r.endMinute <= r.startMinute) throw new ConvexError("Closing time must be after opening time");
    const hasBreak = r.breakStartMinute !== undefined && r.breakEndMinute !== undefined;
    if ((r.breakStartMinute === undefined) !== (r.breakEndMinute === undefined)) throw new ConvexError("A break needs a start and an end");
    if (hasBreak) {
      if (!ok(r.breakStartMinute!) || !ok(r.breakEndMinute!)) throw new ConvexError("Times must be in 15 minute steps");
      if (r.breakEndMinute! <= r.breakStartMinute! || r.breakStartMinute! < r.startMinute || r.breakEndMinute! > r.endMinute) {
        throw new ConvexError("The break must sit inside working hours");
      }
    }
    return { weekday: r.weekday, enabled: r.enabled, startMinute: r.startMinute, endMinute: r.endMinute, ...(hasBreak ? { breakStartMinute: r.breakStartMinute, breakEndMinute: r.breakEndMinute } : {}) };
  });
}

type Ctx = QueryCtx | MutationCtx;

export type DayAvailability = { date: string; windows: [number, number][]; busy: [number, number][] };

/** Working windows (break removed) and busy intervals, in Auckland minutes, for `days` days from `from`. */
export async function availabilityFor(ctx: Ctx, providerId: Id<"providers">, from: string, days: number, now = Date.now()) {
  const hours = await ctx.db.query("workingHours").withIndex("by_provider", (q) => q.eq("providerId", providerId)).take(7);
  const configured = hours.length > 0;
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const horizonEnd = localToUtc(addDays(from, days), 0);
  const blocks: [number, number][] = [];
  for await (const t of ctx.db.query("timeOff").withIndex("by_provider_and_endsAt", (q) => q.eq("providerId", providerId).gt("endsAt", now))) {
    if (t.startsAt < horizonEnd) blocks.push([t.startsAt, t.endsAt]);
  }
  // Accepted and completed bookings hold their time; pending requests do not.
  for (const status of ["accepted", "completed"] as const) {
    for await (const b of ctx.db.query("bookings").withIndex("by_provider_and_status_and_endsAt", (q) => q.eq("providerId", providerId).eq("status", status).gt("endsAt", now))) {
      if (b.startsAt < horizonEnd) blocks.push([b.startsAt, b.endsAt]);
    }
  }
  const out: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const row: Doc<"workingHours"> | undefined = byDay.get(weekdayOf(date));
    let windows: [number, number][] = [];
    if (!configured) windows = [DEFAULT_WINDOW];
    else if (row?.enabled) {
      windows = row.breakStartMinute !== undefined && row.breakEndMinute !== undefined
        ? [[row.startMinute, row.breakStartMinute], [row.breakEndMinute, row.endMinute]]
        : [[row.startMinute, row.endMinute]];
    }
    const dayStart = localToUtc(date, 0), dayEnd = localToUtc(addDays(date, 1), 0);
    const busy: [number, number][] = blocks
      .filter(([s, e]) => s < dayEnd && e > dayStart)
      .map(([s, e]): [number, number] => [Math.round((Math.max(s, dayStart) - dayStart) / 60_000), Math.round((Math.min(e, dayEnd) - dayStart) / 60_000)])
      .sort((x, y) => x[0] - y[0]);
    out.push({ date, windows, busy });
  }
  return { configured, days: out };
}

/** Does [startMinute, endMinute) on a day sit inside a working window and clear of every busy interval? */
export function fits(day: DayAvailability, startMinute: number, endMinute: number): boolean {
  return day.windows.some(([s, e]) => startMinute >= s && endMinute <= e) && !day.busy.some(([s, e]) => startMinute < e && s < endMinute);
}

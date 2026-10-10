import { aucklandToDate } from "./time";

// Everything on the provider calendar is Auckland wall time, whatever the device's timezone is.
const TZ = "Pacific/Auckland";
const DAY = 86_400_000;
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** The Auckland calendar date and clock time of an instant. */
export function aucklandParts(ms: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour, minute: +p.minute, key: `${p.year}-${p.month}-${p.day}` };
}

const keyOf = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);

export type WeekDay = { key: string; name: string; date: number; month: string; isToday: boolean };

/**
 * The Monday-to-Sunday week `offset` weeks from the one containing `nowMs`, in Auckland time.
 * `from` is Monday 00:00 Auckland and `to` the next Monday 00:00 Auckland, so a week with a clock change is 167 or 169 hours long
 * and nothing near midnight lands on the wrong day.
 */
export function weekOf(nowMs: number, offset: number) {
  const t = aucklandParts(nowMs);
  const todayUtc = Date.UTC(t.y, t.m - 1, t.d); // a plain calendar date: day arithmetic on it has no daylight saving in it
  const sinceMonday = (new Date(todayUtc).getUTCDay() + 6) % 7;
  const mondayUtc = todayUtc - sinceMonday * DAY + offset * 7 * DAY;
  const days: WeekDay[] = DAY_NAMES.map((name, i) => {
    const d = new Date(mondayUtc + i * DAY);
    return { key: keyOf(mondayUtc + i * DAY), name, date: d.getUTCDate(), month: d.toLocaleString("en-NZ", { month: "short", timeZone: "UTC" }), isToday: keyOf(mondayUtc + i * DAY) === t.key };
  });
  return { days, from: aucklandToDate(`${keyOf(mondayUtc)}T00:00`).getTime(), to: aucklandToDate(`${keyOf(mondayUtc + 7 * DAY)}T00:00`).getTime() };
}

/** Which two-hour rows to draw: 8 am to 6 pm as a minimum, widened to include any early start or late finish in view. */
export function hourRows(startsAt: number[]): number[] {
  const hours = startsAt.map((ms) => aucklandParts(ms).hour);
  const first = Math.floor(Math.min(8, ...hours) / 2) * 2;
  const last = Math.ceil(Math.max(18, ...hours.map((h) => h + 1)) / 2) * 2;
  return Array.from({ length: (last - first) / 2 }, (_, i) => first + i * 2);
}

export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export const clock = (ms: number) => new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));

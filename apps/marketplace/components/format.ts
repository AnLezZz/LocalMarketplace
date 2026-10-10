const TZ = "Pacific/Auckland";

/** "$45" or "$45.50": whole dollars drop the cents, otherwise both digits show. */
export function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** "$45/hr" or "$120 fixed". */
export function rate(cents: number, basis: string): { amount: string; unit: string } {
  return { amount: dollars(cents), unit: basis === "hourly" ? "/hr" : " fixed" };
}

const dayFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** A booking window in Auckland time: { day: "Mon, 12 Oct 2026", time: "10:00 am – 12:00 pm" }. */
export function bookingWindow(startMs: number, endMs: number): { day: string; time: string } {
  const d1 = dayFmt.format(startMs), d2 = dayFmt.format(endMs);
  const t1 = timeFmt.format(startMs), t2 = timeFmt.format(endMs);
  return d1 === d2 ? { day: d1, time: `${t1} – ${t2}` } : { day: `${d1} – ${d2}`, time: `${t1} – ${t2}` };
}

/** Morning / afternoon / evening in Auckland right now. */
export function partOfDay(now = new Date()): "morning" | "afternoon" | "evening" {
  const h = Number(new Intl.DateTimeFormat("en-NZ", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

/** "Quote on request", "$50/hr" or "$90 fixed". */
export function priceLabel(s: { priceType: string; priceCents?: number }): string {
  return s.priceType === "quote" ? "Quote on request" : `${dollars(s.priceCents ?? 0)}${s.priceType === "hourly" ? "/hr" : " fixed"}`;
}

/** "45 min", "2 hr" or "1 hr 30 min". */
export function durationLabel(min: number): string {
  return min % 60 === 0 ? `${min / 60} hr` : min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr ${min % 60} min`;
}

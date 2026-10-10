const TZ = "Pacific/Auckland";

/** Convert a datetime-local value (Auckland wall time, "YYYY-MM-DDTHH:mm") to a UTC instant. */
export function aucklandToDate(local: string): Date {
  const guess = new Date(local + "Z");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(guess);
  const off = parts.find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
  return new Date(`${local}:00${off}`);
}

/** Auckland wall time now, "YYYY-MM-DDTHH:mm". */
export function aucklandNow(): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** 540 -> "9:00 am". */
export function minuteLabel(m: number): string {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ":00"} ${h < 12 || m === 1440 ? "am" : "pm"}`;
}

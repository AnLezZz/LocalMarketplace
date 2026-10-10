import { describe, expect, test } from "vitest";
import { aucklandParts, hourLabel, hourRows, weekOf } from "../lib/calendarWeek";

const at = (iso: string) => new Date(iso).getTime();
const HOUR = 3_600_000;

describe("Auckland weeks", () => {
  test("a normal week runs Monday 00:00 to the next Monday 00:00 Auckland time (168 hours)", () => {
    const w = weekOf(at("2026-10-14T01:00:00Z"), 0); // Wed 14 Oct 2026 14:00 NZDT
    expect(w.days.map((d) => d.key)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(w.to - w.from).toBe(168 * HOUR);
    expect(aucklandParts(w.from)).toMatchObject({ key: "2026-10-12", hour: 0, minute: 0 });
    expect(w.days.find((d) => d.isToday)?.key).toBe("2026-10-14");
  });
  test("the week the clocks go forward (Sun 27 Sep 2026) is 167 hours; the week they go back (Sun 5 Apr 2026) is 169", () => {
    const fwd = weekOf(at("2026-09-23T00:00:00Z"), 0);
    expect(fwd.days[0].key).toBe("2026-09-21");
    expect(fwd.to - fwd.from).toBe(167 * HOUR);
    const back = weekOf(at("2026-04-01T00:00:00Z"), 0);
    expect(back.days[0].key).toBe("2026-03-30");
    expect(back.to - back.from).toBe(169 * HOUR);
  });
  test("a job just either side of Auckland midnight lands on the right day, whatever UTC says", () => {
    const w = weekOf(at("2026-10-14T01:00:00Z"), 0);
    const late = at("2026-10-14T10:59:00Z"); // Wed 23:59 NZDT
    const early = at("2026-10-14T11:00:00Z"); // Thu 00:00 NZDT
    expect(aucklandParts(late).key).toBe("2026-10-14");
    expect(aucklandParts(early).key).toBe("2026-10-15");
    expect(late >= w.from && early < w.to).toBe(true);
  });
  test("a Sunday-night job belongs to that week, a Monday 00:00 job to the next", () => {
    const w = weekOf(at("2026-10-14T01:00:00Z"), 0);
    const sundayNight = at("2026-10-18T10:30:00Z"); // Sun 23:30 NZDT
    const mondayMidnight = at("2026-10-18T11:00:00Z"); // Mon 00:00 NZDT
    expect(sundayNight >= w.from && sundayNight < w.to).toBe(true);
    expect(mondayMidnight >= w.to).toBe(true);
    expect(weekOf(at("2026-10-14T01:00:00Z"), 1).from).toBe(w.to);
  });
  test("week offsets go back and forward by exactly one week of calendar days", () => {
    expect(weekOf(at("2026-10-14T01:00:00Z"), -2).days[0].key).toBe("2026-09-28");
    expect(weekOf(at("2026-12-30T01:00:00Z"), 0).days.map((d) => d.key)[6]).toBe("2027-01-03");
  });
});

describe("hour rows", () => {
  test("8 am to 6 pm by default; early starts and late finishes widen it", () => {
    expect(hourRows([]).at(0)).toBe(8);
    expect(hourRows([]).at(-1)).toBe(16); // the 4 pm row ends at 6 pm
    const early = hourRows([at("2026-10-13T17:30:00Z")]); // Wed 06:30 NZDT
    expect(early.at(0)).toBe(6);
    const late = hourRows([at("2026-10-14T10:30:00Z")]); // Wed 23:30 NZDT
    expect(late.at(-1)).toBe(22); // the 22:00 row covers 11 pm
    expect(hourLabel(22)).toBe("10 PM");
    expect(hourLabel(0)).toBe("12 AM");
  });
});

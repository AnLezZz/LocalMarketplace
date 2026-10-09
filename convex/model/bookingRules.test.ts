import { describe, expect, test } from "vitest";
import { canTransition } from "./bookingRules";

describe("canTransition", () => {
  test("provider may accept, decline or cancel a request, then complete or cancel an accepted job", () => {
    expect(canTransition("provider", "requested", "accepted")).toBe(true);
    expect(canTransition("provider", "requested", "declined")).toBe(true);
    expect(canTransition("provider", "requested", "cancelled")).toBe(true);
    expect(canTransition("provider", "accepted", "completed")).toBe(true);
    expect(canTransition("provider", "accepted", "cancelled")).toBe(true);
  });

  test("customer may only cancel", () => {
    expect(canTransition("customer", "requested", "cancelled")).toBe(true);
    expect(canTransition("customer", "accepted", "cancelled")).toBe(true);
    for (const to of ["accepted", "declined", "completed"] as const) {
      expect(canTransition("customer", "requested", to)).toBe(false);
      expect(canTransition("customer", "accepted", to)).toBe(false);
    }
  });

  test("finished bookings never move", () => {
    for (const from of ["declined", "cancelled", "completed"] as const) {
      for (const actor of ["provider", "customer"] as const) {
        for (const to of ["accepted", "declined", "cancelled", "completed"] as const) {
          expect(canTransition(actor, from, to)).toBe(false);
        }
      }
    }
  });
});

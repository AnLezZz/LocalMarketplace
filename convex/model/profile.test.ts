import { describe, expect, test } from "vitest";
import { passwordProfile } from "./profile";

describe("passwordProfile", () => {
  test("ignores a client-supplied role", () => {
    for (const role of ["admin", "provider", "ADMIN", 1, true]) {
      expect(passwordProfile({ email: "a@b.nz", role: role as never }).role).toBe("customer");
    }
  });

  test("normalises the email and trims the name", () => {
    const p = passwordProfile({ email: "  Kiri@Example.NZ ", name: "  Kiri  " });
    expect(p).toEqual({ email: "kiri@example.nz", name: "Kiri", role: "customer" });
  });

  test("treats a blank name as absent", () => {
    expect(passwordProfile({ email: "a@b.nz", name: "   " }).name).toBeUndefined();
  });

  test("rejects a missing email", () => {
    expect(() => passwordProfile({ password: "x" })).toThrow("Email is required");
  });
});

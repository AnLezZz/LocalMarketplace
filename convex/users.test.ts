import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, createUser, newT } from "../test-utils/harness";

describe("users.me", () => {
  test("is null when signed out", async () => {
    const t = newT();
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("returns the caller's role and email", async () => {
    const t = newT();
    const id = await createUser(t, "customer", "kiri@example.nz");
    const me = await asUser(t, id).query(api.users.me, {});
    expect(me).toMatchObject({ id, email: "kiri@example.nz", role: "customer" });
  });
});

describe("users.grantAdmin", () => {
  test("promotes by email, ignoring case", async () => {
    const t = newT();
    const id = await createUser(t, "customer", "boss@example.nz");
    await t.mutation(internal.users.grantAdmin, { email: " Boss@Example.NZ " });
    expect((await t.run((ctx) => ctx.db.get(id)))?.role).toBe("admin");
  });

  test("fails for an unknown email", async () => {
    const t = newT();
    await expect(t.mutation(internal.users.grantAdmin, { email: "nobody@example.nz" })).rejects.toThrow("No user with that email");
  });
});

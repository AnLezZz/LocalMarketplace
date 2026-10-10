import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { createUser, newT } from "../test-utils/harness";
import { generateCode, sendCode } from "./model/authEmail";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("generateCode", () => {
  test("is always eight digits and not repeated", () => {
    const codes = Array.from({ length: 500 }, generateCode);
    expect(codes.every((c) => /^\d{8}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(495);
    expect(new Set(codes.join("")).size).toBe(10); // every digit shows up
  });
});

describe("sendCode", () => {
  test("posts the code to Resend with the configured sender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "re_test"); vi.stubEnv("EMAIL_FROM", "Localo <hi@localo.example>");
    await sendCode("kiri@example.nz", "Reset your Localo password", "Use this code.", "12345678");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Localo <hi@localo.example>", to: ["kiri@example.nz"], subject: "Reset your Localo password" });
    expect(JSON.parse(init.body).html).toContain("12345678");
  });

  test("fails loudly (so the flow stops) when Resend rejects or nothing is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 422 })));
    await expect(sendCode("a@b.nz", "s", "i", "1")).rejects.toThrow("422");
    vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("AUTH_LOG_CODES", "");
    await expect(sendCode("a@b.nz", "s", "i", "1")).rejects.toThrow("not configured");
  });

  test("with AUTH_LOG_CODES (development) it logs the code instead of sending", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("AUTH_LOG_CODES", "true");
    await sendCode("kiri@example.nz", "s", "i", "87654321");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[auth code] kiri@example.nz 87654321");
  });
});

describe("users.authFeatures", () => {
  test("reset needs a way to send; verification needs its own explicit switch", async () => {
    const t = newT();
    vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("AUTH_LOG_CODES", ""); vi.stubEnv("REQUIRE_EMAIL_VERIFICATION", "");
    expect(await t.query(api.users.authFeatures, {})).toEqual({ passwordReset: false, emailVerification: false });
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(await t.query(api.users.authFeatures, {})).toEqual({ passwordReset: true, emailVerification: false });
    vi.stubEnv("REQUIRE_EMAIL_VERIFICATION", "true");
    expect(await t.query(api.users.authFeatures, {})).toEqual({ passwordReset: true, emailVerification: true });
    vi.stubEnv("RESEND_API_KEY", ""); // asking for verification without a way to send does nothing
    expect(await t.query(api.users.authFeatures, {})).toEqual({ passwordReset: false, emailVerification: false });
  });
});

describe("users.markExistingVerified", () => {
  test("stamps only password accounts that are not verified yet", async () => {
    const t = newT();
    const userId = await createUser(t, "customer", "kiri@example.nz");
    const [a, b, c] = await t.run(async (ctx) => [
      await ctx.db.insert("authAccounts", { userId, provider: "password", providerAccountId: "kiri@example.nz", secret: "x" }),
      await ctx.db.insert("authAccounts", { userId, provider: "password", providerAccountId: "done@example.nz", secret: "x", emailVerified: "done@example.nz" }),
      await ctx.db.insert("authAccounts", { userId, provider: "github", providerAccountId: "123" }),
    ]);
    expect(await t.mutation(internal.users.markExistingVerified, {})).toBe(1);
    const rows = await t.run((ctx) => Promise.all([a, b, c].map((id) => ctx.db.get(id))));
    expect(rows[0]?.emailVerified).toBe("kiri@example.nz");
    expect(rows[1]?.emailVerified).toBe("done@example.nz");
    expect(rows[2]?.emailVerified).toBeUndefined();
    expect(await t.mutation(internal.users.markExistingVerified, {})).toBe(0);
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { renderEmail } from "./email";

const HOUR = 3_600_000;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("renderEmail", () => {
  test("escapes user text and builds an absolute link", () => {
    const m = renderEmail({ title: "New <b>request</b>", body: 'Kiri "K" & co', href: "/provider/bookings/abc" }, "https://localo.example");
    expect(m.subject).toBe("New <b>request</b>");
    expect(m.html).toContain("New &lt;b&gt;request&lt;/b&gt;");
    expect(m.html).toContain("Kiri &quot;K&quot; &amp; co");
    expect(m.html).not.toContain("<b>request</b>");
    expect(m.html).toContain('href="https://localo.example/provider/bookings/abc"');
    expect(m.text).toContain("https://localo.example/provider/bookings/abc");
    expect(renderEmail({ title: "t", body: "b", href: "/x" }, "http://localhost:3000/").text).toContain("http://localhost:3000/x");
  });
});

describe("email.send", () => {
  const args = { to: "kiri@example.nz", title: "Booking accepted", body: "Fern accepted it.", href: "/bookings/1" };

  test("skips quietly without an API key", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await newT().action(internal.email.send, args)).toEqual({ sent: false, reason: "no key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("posts to Resend with the key, sender, recipient and content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "re_test"); vi.stubEnv("SITE_URL", "https://localo.example"); vi.stubEnv("EMAIL_FROM", "Localo <hi@localo.example>");
    expect(await newT().action(internal.email.send, args)).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Localo <hi@localo.example>", to: ["kiri@example.nz"], subject: "Booking accepted" });
    expect(body.html).toContain("https://localo.example/bookings/1");
  });

  test("defaults the sender and never throws when Resend errors or the network fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const bad = vi.fn().mockResolvedValue(new Response("nope", { status: 422 })); vi.stubGlobal("fetch", bad);
    expect(await newT().action(internal.email.send, args)).toEqual({ sent: false, reason: "status 422" });
    expect(JSON.parse(bad.mock.calls[0][1].body).from).toBe("Localo <onboarding@resend.dev>");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await newT().action(internal.email.send, args)).toEqual({ sent: false, reason: "network" });
  });
});

async function world() {
  const t = newT();
  const ownerId = await createUser(t, "provider", "fern@example.nz");
  const providerId = await createProvider(t, ownerId, { name: "Fern Gardens" });
  const customerId = await createUser(t, "customer", "kiri@example.nz");
  const owner = asUser(t, ownerId), customer = asUser(t, customerId);
  let n = 0;
  const request = () => {
    const startsAt = Date.now() + (30 + 3 * n++) * HOUR;
    return customer.mutation(api.bookings.create, { address: "12 Test Street", suburb: "Ponsonby", providerId, customerName: "Kiri", description: "Mow", startsAt, endsAt: startsAt + HOUR });
  };
  const scheduled = () => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return { t, owner, customer, providerId, ownerId, request, scheduled };
}

describe("emails queued by events", () => {
  test("a request queues an email to the provider; acceptance queues one to the customer", async () => {
    vi.useFakeTimers();
    const { owner, request, scheduled } = await world();
    const id = await request();
    let jobs = await scheduled();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({ to: "fern@example.nz", title: "New booking request", href: `/provider/bookings/${id}` });
    await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    jobs = await scheduled();
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.args[0].to).sort()).toEqual(["fern@example.nz", "kiri@example.nz"]);
  });

  test("no email is queued for a recipient without an address, or when a transition is refused", async () => {
    vi.useFakeTimers();
    const { t, ownerId, customer, request, scheduled } = await world();
    await t.run((ctx) => ctx.db.patch(ownerId, { email: undefined }));
    const id = await request();
    expect(await scheduled()).toHaveLength(0); // provider has no email; the in-app notice still exists
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(1);
    await customer.mutation(api.bookings.transition, { bookingId: id, to: "accepted" }); // refused
    expect(await scheduled()).toHaveLength(0);
  });
});

describe("reminders", () => {
  test("sends one reminder to each side for accepted bookings starting within 24 hours, once", async () => {
    vi.useFakeTimers();
    const { t, owner, providerId, customer, request, scheduled } = await world();
    const soon = await request(), later = await request(), pending = await request();
    for (const id of [soon, later]) await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    const nowMs = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(soon, { startsAt: nowMs + 20 * HOUR, endsAt: nowMs + 21 * HOUR });
      await ctx.db.patch(pending, { startsAt: nowMs + 5 * HOUR, endsAt: nowMs + 6 * HOUR });
    });
    expect(await t.mutation(internal.reminders.sendDue, {})).toBe(1);
    const reminders = (await t.run((ctx) => ctx.db.query("notifications").collect())).filter((n) => n.kind === "booking_reminder");
    expect(reminders).toHaveLength(2);
    expect(reminders.map((r) => r.href).sort()).toEqual([`/bookings/${soon}`, `/provider/bookings/${soon}`].sort());
    expect((await scheduled()).filter((j) => /Reminder/.test(j.args[0].title))).toHaveLength(2);
    expect((await t.run((ctx) => ctx.db.get(soon)))?.reminderSentAt).toBeTypeOf("number");
    expect((await t.run((ctx) => ctx.db.get(later)))?.reminderSentAt).toBeUndefined();
    expect(await t.mutation(internal.reminders.sendDue, {})).toBe(0); // not again
    void providerId; void customer;
  });

  test("does not remind about bookings already started, cancelled, or declined", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, request } = await world();
    const started = await request(), cancelled = await request();
    for (const id of [started, cancelled]) await owner.mutation(api.bookings.transition, { bookingId: id, to: "accepted" });
    const nowMs = Date.now();
    await t.run((ctx) => ctx.db.patch(started, { startsAt: nowMs - HOUR, endsAt: nowMs + HOUR }));
    await customer.mutation(api.bookings.transition, { bookingId: cancelled, to: "cancelled" });
    await t.run((ctx) => ctx.db.patch(cancelled, { startsAt: nowMs + 3 * HOUR, endsAt: nowMs + 4 * HOUR }));
    expect(await t.mutation(internal.reminders.sendDue, {})).toBe(0);
  });
});

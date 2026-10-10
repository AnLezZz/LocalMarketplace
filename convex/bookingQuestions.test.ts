import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

const HOUR = 3_600_000;
const questions = [
  { id: "q1", label: "How many rooms?", type: "text", required: true },
  { id: "q2", label: "Pets at home?", type: "yesno", required: false },
  { id: "q3", label: "Which finish?", type: "choice", required: true, options: ["Matte", "Gloss"] },
];

async function setup() {
  const t = newT();
  const ownerId = await createUser(t, "provider"), otherOwnerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { suburb: "Ponsonby", category: "cleaning" });
  await createProvider(t, otherOwnerId, { suburb: "Ponsonby" });
  const owner = asUser(t, ownerId), otherOwner = asUser(t, otherOwnerId);
  const customer = asUser(t, await createUser(t, "customer", "kiri@example.nz")), stranger = asUser(t, await createUser(t, "customer"));
  const service = (extra: Record<string, unknown> = {}) =>
    owner.mutation(api.services.create, { name: "Paint a room", description: "", priceType: "fixed", priceCents: 6000, durationMinutes: 60, locationMode: "online", ...extra } as never);
  let n = 0;
  const book = (serviceId: unknown, extra: Record<string, unknown> = {}) => {
    const startsAt = Date.now() + (24 + 3 * n++) * HOUR;
    return customer.mutation(api.bookings.create, { providerId, customerName: "Kiri", description: "Please", startsAt, endsAt: startsAt + HOUR, serviceId, ...extra } as never);
  };
  return { t, owner, otherOwner, customer, stranger, providerId, service, book };
}

describe("service questions", () => {
  test("are validated when saved: limits, duplicates, choices", async () => {
    const { service, owner } = await setup();
    await expect(service({ questions: Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, label: "x", type: "text", required: false })) })).rejects.toThrow("at most 8");
    await expect(service({ questions: [{ id: "a", label: " ", type: "text", required: false }] })).rejects.toThrow("wording");
    await expect(service({ questions: [{ id: "a", label: "x", type: "text", required: false }, { id: "a", label: "y", type: "text", required: false }] })).rejects.toThrow("Invalid question");
    await expect(service({ questions: [{ id: "a", label: "Pick", type: "choice", required: true, options: ["Only one"] }] })).rejects.toThrow("2 to 10");
    const id = await service({ questions: [{ id: "a", label: " Pick ", type: "choice", required: true, options: [" Red ", "Red", "Blue"] }, { id: "b", label: "Why", type: "text", required: false, options: ["junk"] }] });
    const [row] = (await owner.query(api.services.listMine, {})).filter((s) => s._id === id);
    expect(row.questions).toEqual([{ id: "a", label: "Pick", type: "choice", required: true, options: ["Red", "Blue"] }, { id: "b", label: "Why", type: "text", required: false }]);
  });
  test("are public, and only the owner can change them", async () => {
    const { service, owner, otherOwner, providerId, t } = await setup();
    const id = await service({ questions });
    expect((await t.query(api.services.listForProvider, { providerId }))[0].questions).toHaveLength(3);
    await expect(otherOwner.mutation(api.services.update, { id, name: "x", description: "", priceType: "fixed", priceCents: 6000, durationMinutes: 60, questions: [] } as never)).rejects.toThrow();
    await owner.mutation(api.services.update, { id, name: "Paint a room", description: "", priceType: "fixed", priceCents: 6000, durationMinutes: 60, questions: [] } as never);
    expect((await t.query(api.services.listForProvider, { providerId }))[0].questions).toBeUndefined();
  });
});

describe("answers on a booking", () => {
  test("are checked against the service's questions and copied with their wording", async () => {
    const { service, book, t, owner, customer, stranger } = await setup();
    const id = await service({ questions });
    await expect(book(id, { answers: [{ id: "q3", value: "Matte" }] })).rejects.toThrow('Answer "How many rooms?"');
    await expect(book(id, { answers: [{ id: "q1", value: "3" }] })).rejects.toThrow('Answer "Which finish?"');
    await expect(book(id, { answers: [{ id: "q1", value: "3" }, { id: "q3", value: "Satin" }] })).rejects.toThrow("Choose one of the options");
    await expect(book(id, { answers: [{ id: "q1", value: "3" }, { id: "q3", value: "Matte" }, { id: "q2", value: "Maybe" }] })).rejects.toThrow("Yes or No");
    await expect(book(id, { answers: [{ id: "q1", value: "3" }, { id: "q3", value: "Matte" }, { id: "zz", value: "hack" }] })).rejects.toThrow("have changed");
    await expect(book(id, { answers: [{ id: "q1", value: "3" }, { id: "q1", value: "4" }, { id: "q3", value: "Matte" }] })).rejects.toThrow("have changed");
    await expect(book(id, { answers: [{ id: "q1", value: "x".repeat(501) }, { id: "q3", value: "Matte" }] })).rejects.toThrow("too long");
    const bookingId = await book(id, { answers: [{ id: "q1", value: " 3 " }, { id: "q3", value: "Gloss" }, { id: "q2", value: "" }] });
    const row = await t.run((ctx) => ctx.db.get(bookingId));
    expect(row?.answers).toEqual([{ label: "How many rooms?", type: "text", value: "3" }, { label: "Which finish?", type: "choice", value: "Gloss" }]);
    // editing the questions later never rewrites the booking
    await owner.mutation(api.services.update, { id, name: "Paint a room", description: "", priceType: "fixed", priceCents: 6000, durationMinutes: 60, locationMode: "online", questions: [{ id: "q1", label: "Totally new wording", type: "text", required: false }] } as never);
    expect((await customer.query(api.bookings.getForCustomer, { id: bookingId }))?.answers).toEqual(row?.answers);
    expect((await owner.query(api.bookings.getForProvider, { id: bookingId }))?.answers).toEqual(row?.answers);
    expect(await stranger.query(api.bookings.getForCustomer, { id: bookingId })).toBeNull();
    expect(await stranger.query(api.bookings.getForProvider, { id: bookingId })).toBeNull();
  });
  test("a service with no questions refuses answers it never asked for, and bookings without questions have none", async () => {
    const { service, book, t } = await setup();
    const id = await service();
    await expect(book(id, { answers: [{ id: "q1", value: "sneaky" }] })).rejects.toThrow("have changed");
    const bookingId = await book(id);
    expect((await t.run((ctx) => ctx.db.get(bookingId)))?.answers).toBeUndefined();
    const general = await book(undefined, { address: "12 Test Street", suburb: "Ponsonby" });
    expect((await t.run((ctx) => ctx.db.get(general)))?.answers).toBeUndefined();
  });
});

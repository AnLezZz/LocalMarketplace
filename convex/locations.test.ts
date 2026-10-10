import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";
import { suburbKey } from "./model/locations";

const HOUR = 3_600_000;
const profile = { name: "Fern", bio: "Gardens and more", category: "gardening", suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const };

async function world() {
  const t = newT();
  const admin = asUser(t, await createUser(t, "admin"));
  const ownerId = await createUser(t, "provider");
  const providerId = await createProvider(t, ownerId, { suburb: "Mt Eden" });
  const owner = asUser(t, ownerId), customer = asUser(t, await createUser(t, "customer"));
  const book = (suburb: string) => {
    const startsAt = Date.now() + 40 * HOUR;
    return customer.mutation(api.bookings.create, { address: "12 Test Street", suburb, providerId, customerName: "K", description: "d", startsAt, endsAt: startsAt + HOUR });
  };
  return { t, admin, owner, customer, providerId, book };
}

describe("suburbKey", () => {
  test("ignores case, spacing, punctuation, macrons and Mt/Mount", () => {
    expect(suburbKey("  Mt  Eden ")).toBe("mount eden");
    expect(suburbKey("MOUNT EDEN")).toBe("mount eden");
    expect(suburbKey("Māngere")).toBe("mangere");
    expect(suburbKey("St. Heliers")).toBe("st heliers");
    expect(suburbKey("Grey Lynn")).toBe("grey lynn");
  });
});

describe("overview and city", () => {
  test("defaults to Auckland with no restriction; the city can be changed", async () => {
    const { t, admin, customer } = await world();
    expect(await t.query(api.locations.overview, {})).toEqual({ city: "Auckland", restricted: false, suburbs: [] });
    await admin.mutation(api.locations.setCity, { city: "  Wellington  " });
    expect((await customer.query(api.locations.overview, {})).city).toBe("Wellington");
    await expect(admin.mutation(api.locations.setCity, { city: " " })).rejects.toThrow("city");
    await expect(admin.mutation(api.locations.setCity, { city: "x".repeat(61) })).rejects.toThrow("too long");
    await admin.mutation(api.locations.setCity, { city: "Auckland" });
    expect((await t.query(api.locations.overview, {})).city).toBe("Auckland");
  });
});

describe("suburb list", () => {
  test("bulk add dedupes across spellings; enabled ones are public, sorted; enable, disable and remove", async () => {
    const { t, admin } = await world();
    expect(await admin.mutation(api.locations.addSuburbs, { names: ["Ponsonby", "mt eden", "Mount Eden", " grey  lynn ", "", "PONSONBY"] })).toBe(3);
    expect(await admin.mutation(api.locations.addSuburbs, { names: ["Ponsonby", "Herne Bay"] })).toBe(1);
    expect(await t.query(api.locations.overview, {})).toMatchObject({ restricted: true, suburbs: ["grey lynn", "Herne Bay", "mt eden", "Ponsonby"] });
    const list = (await admin.query(api.locations.adminList, {})).suburbs;
    const ponsonby = list.find((s) => s.name === "Ponsonby")!;
    await admin.mutation(api.locations.setSuburbEnabled, { id: ponsonby._id, enabled: false });
    expect((await t.query(api.locations.overview, {})).suburbs).not.toContain("Ponsonby");
    expect((await admin.query(api.locations.adminList, {})).suburbs.find((s) => s.name === "Ponsonby")?.enabled).toBe(false);
    await admin.mutation(api.locations.removeSuburb, { id: ponsonby._id });
    expect((await admin.query(api.locations.adminList, {})).suburbs.some((s) => s.name === "Ponsonby")).toBe(false);
    await expect(admin.mutation(api.locations.addSuburbs, { names: ["x".repeat(61)] })).rejects.toThrow("too long");
    expect((await admin.query(api.admin.listAudit, {})).map((a) => a.action)).toEqual(expect.arrayContaining(["suburb.add", "suburb.disable", "suburb.remove"]));
  });

  test("only admins manage locations", async () => {
    const { t, owner, customer } = await world();
    for (const who of [owner, customer]) {
      await expect(who.mutation(api.locations.addSuburbs, { names: ["X"] })).rejects.toThrow("Not allowed");
      await expect(who.mutation(api.locations.setCity, { city: "X" })).rejects.toThrow("Not allowed");
      await expect(who.query(api.locations.adminList, {})).rejects.toThrow("Not allowed");
    }
    await expect(t.mutation(api.locations.addSuburbs, { names: ["X"] })).rejects.toThrow("Sign in required");
  });
});

describe("enforcement", () => {
  test("with no suburbs configured nothing is restricted", async () => {
    const { owner, book } = await world();
    await expect(book("Anywhere At All")).resolves.toBeTruthy();
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, suburb: "Whangarei" })).resolves.toBeNull();
  });

  test("with a list, bookings, profile edits, applications and service areas must use an enabled suburb", async () => {
    const { t, admin, owner, customer, book } = await world();
    await admin.mutation(api.locations.addSuburbs, { names: ["Mount Eden", "Ponsonby", "Grey Lynn"] });
    await expect(book("Takapuna")).rejects.toThrow("We don't operate in Takapuna yet");
    await expect(book("Mt Eden")).resolves.toBeTruthy(); // spelling variants count
    await expect(book(" ponsonby ")).resolves.toBeTruthy();

    await expect(owner.mutation(api.providers.updateProfile, { ...profile, suburb: "Takapuna" })).rejects.toThrow("Pick a suburb from the list");
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, suburb: "Grey Lynn" })).resolves.toBeNull();
    await expect(owner.mutation(api.providers.setServiceAreas, { suburbs: ["Ponsonby", "Takapuna"] })).rejects.toThrow("Takapuna isn't a suburb");
    await expect(owner.mutation(api.providers.setServiceAreas, { suburbs: ["Ponsonby", "mt eden"] })).resolves.toBeNull();
    const applicant = asUser(t, await createUser(t, "customer"));
    await expect(applicant.mutation(api.providers.submitProfile, { ...profile, suburb: "Takapuna" })).rejects.toThrow("Pick a suburb from the list");
    await expect(applicant.mutation(api.providers.submitProfile, { ...profile, suburb: "Ponsonby" })).resolves.toBeTruthy();

    // disabling a suburb stops new bookings there but leaves a provider based there (unchanged) editable
    const eden = (await admin.query(api.locations.adminList, {})).suburbs.find((s) => s.name === "Mount Eden")!;
    await admin.mutation(api.locations.setSuburbEnabled, { id: eden._id, enabled: false });
    await expect(book("Mount Eden")).rejects.toThrow("We don't operate in Mount Eden yet");
    void customer;
  });

  test("a provider keeps their own suburb when editing other fields, even if it was disabled since", async () => {
    const { admin, owner } = await world();
    await admin.mutation(api.locations.addSuburbs, { names: ["Ponsonby"] }); // provider's suburb "Mt Eden" is not listed
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, suburb: "Mt Eden", name: "New name" })).resolves.toBeNull();
    await expect(owner.mutation(api.providers.updateProfile, { ...profile, suburb: "Takapuna" })).rejects.toThrow("Pick a suburb");
  });
});

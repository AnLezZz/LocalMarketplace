"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";

const BACK = "/provider/services";
const done = (r: { ok: boolean; message?: string }, ok = BACK, failed = BACK) => {
  revalidatePath(BACK);
  redirect(r.ok ? ok : `${failed}${failed.includes("?") ? "&" : "?"}err=${encodeURIComponent(r.message ?? "")}`);
};

/** The location part of the service form: only the fields that belong to the chosen mode are sent. */
function location(fd: FormData) {
  const mode = String(fd.get("locationMode") ?? "");
  if (!["customer", "provider", "online", "either"].includes(mode)) return {};
  const m = mode as "customer" | "provider" | "online" | "either";
  const text = (k: string) => String(fd.get(k) ?? "");
  if (m === "provider" || m === "either") return { locationMode: m, venue: { name: text("venueName"), address: text("venueAddress"), suburb: text("venueSuburb"), notes: text("venueNotes") || undefined } };
  if (m === "online") return { locationMode: m, onlineNote: text("onlineNote") || undefined, meetingLink: text("meetingLink") || undefined };
  return { locationMode: m };
}

/** The question editor sends its whole list as JSON; the server (Convex) does the real validation. */
function questions(fd: FormData) {
  try {
    const list = JSON.parse(String(fd.get("questions") ?? "[]"));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

/** Creates a service, or updates it when the form carries an id. */
export async function saveService(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const priceType = ["fixed", "hourly", "quote"].includes(String(fd.get("priceType"))) ? (String(fd.get("priceType")) as "fixed" | "hourly" | "quote") : "fixed";
  const dollars = Number(fd.get("price"));
  const args = {
    name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? ""), priceType,
    priceCents: priceType === "quote" || !Number.isFinite(dollars) ? undefined : Math.round(dollars * 100),
    durationMinutes: Number(fd.get("duration")),
    categorySlug: String(fd.get("categorySlug") ?? "") || undefined,
    ...location(fd),
    questions: questions(fd),
  };
  const r = await attempt(async () => id
    ? fetchMutation(api.services.update, { id, ...args }, await authOpts())
    : fetchMutation(api.services.create, args, await authOpts()));
  done(r, `${BACK}?ok=saved`, `${BACK}?${id ? `edit=${id}` : "add=1"}`);
}

export async function setServiceEnabled(id: string, enabled: boolean) {
  done(await attempt(async () => fetchMutation(api.services.setEnabled, { id, enabled }, await authOpts())), `${BACK}?ok=${enabled ? "enabled" : "disabled"}`);
}

export async function archiveService(id: string) {
  done(await attempt(async () => fetchMutation(api.services.archive, { id }, await authOpts())), `${BACK}?ok=archived`);
}

export async function saveServiceAreas(fd: FormData) {
  const suburbs = String(fd.get("suburbs") ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  done(await attempt(async () => fetchMutation(api.providers.setServiceAreas, { suburbs }, await authOpts())), `${BACK}?ok=areas`);
}

// An error must land on a plain URL (a query after "#" is lost), so only a success jumps back to the section.
export async function addServiceArea(placeId: string) {
  const r = await attempt(async () => fetchMutation(api.providers.addServiceArea, { placeId }, await authOpts()));
  done(r, `${BACK}?ok=area-added#area-h`);
}

/** The picker form: the chosen place's ID arrives as `placeId`; typing without picking sends none. */
export async function addServiceAreaFromForm(fd: FormData) {
  const placeId = String(fd.get("placeId") ?? "");
  if (!placeId) return done({ ok: false, message: "Pick a region or district from the list" });
  return addServiceArea(placeId);
}

export async function removeServiceArea(placeId: string) {
  const r = await attempt(async () => fetchMutation(api.providers.removeServiceArea, { placeId }, await authOpts()));
  done(r, `${BACK}?ok=area-removed#area-h`);
}

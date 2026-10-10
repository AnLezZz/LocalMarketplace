"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";

/** Runs one admin mutation and returns to the page the form came from. `back` must be an admin path. */
async function run(fd: FormData, call: (opts: Awaited<ReturnType<typeof authOpts>>) => Promise<unknown>, ok: string) {
  const raw = String(fd.get("back") ?? "/admin");
  const back = raw.startsWith("/admin") && !raw.startsWith("//") ? raw : "/admin";
  const r = await attempt(async () => call(await authOpts()));
  revalidatePath("/admin", "layout");
  const sep = back.includes("?") ? "&" : "?";
  redirect(r.ok ? `${back}${sep}ok=${encodeURIComponent(ok)}` : `${back}${sep}err=${encodeURIComponent(r.message)}`);
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export const suspendProvider = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.suspendProvider, { providerId: s(fd, "id"), reason: s(fd, "reason") }, o), "Provider suspended.");
export const reactivateProvider = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.reactivateProvider, { providerId: s(fd, "id"), note: s(fd, "reason") || undefined }, o), "Provider reactivated.");
export const suspendUser = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.suspendUser, { userId: s(fd, "id"), reason: s(fd, "reason") }, o), "Account suspended.");
export const reactivateUser = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.reactivateUser, { userId: s(fd, "id"), note: s(fd, "reason") || undefined }, o), "Account reactivated.");
export const cancelBooking = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.cancelBooking, { bookingId: s(fd, "id"), reason: s(fd, "reason") }, o), "Booking cancelled.");
export const resolveReport = async (action: "hide" | "dismiss", fd: FormData) => run(fd, (o) => fetchMutation(api.admin.resolveReviewReport, { reportId: s(fd, "id"), action, note: s(fd, "reason") || undefined }, o), action === "hide" ? "Review hidden." : "Report dismissed.");
export const restoreReview = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.restoreReview, { reviewId: s(fd, "id"), note: s(fd, "reason") || undefined }, o), "Review restored.");
export const resolveDispute = async (fd: FormData) => run(fd, (o) => fetchMutation(api.admin.resolveDispute, { disputeId: s(fd, "id"), resolution: s(fd, "reason") }, o), "Dispute resolved.");

// ---------- categories and locations ----------
export const initCategories = async (fd: FormData) => run(fd, (o) => fetchMutation(api.categories.initDefaults, {}, o), "Categories saved. You can edit them now.");
export const createCategory = async (fd: FormData) => run(fd, (o) => fetchMutation(api.categories.create, { label: s(fd, "label"), icon: s(fd, "icon"), hue: s(fd, "hue") }, o), "Category added.");
export const updateCategory = async (fd: FormData) => run(fd, (o) => fetchMutation(api.categories.update, { id: s(fd, "id"), label: s(fd, "label"), icon: s(fd, "icon"), hue: s(fd, "hue") }, o), "Category updated.");
export const setCategoryEnabled = async (id: string, enabled: boolean, fd: FormData) => run(fd, (o) => fetchMutation(api.categories.setEnabled, { id, enabled }, o), enabled ? "Category enabled." : "Category disabled.");
export const moveCategory = async (id: string, direction: "up" | "down", fd: FormData) => run(fd, (o) => fetchMutation(api.categories.move, { id, direction }, o), "Order updated.");

const names = (raw: string) => raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
export const saveCity = async (fd: FormData) => run(fd, (o) => fetchMutation(api.locations.setCity, { city: s(fd, "city") }, o), "City saved.");
export const addSuburbs = async (fd: FormData) => run(fd, (o) => fetchMutation(api.locations.addSuburbs, { names: names(s(fd, "names")) }, o), "Suburbs added.");
export const addPopularSuburbs = async (fd: FormData) => {
  const { AUCKLAND_SUBURBS } = await import("../../lib/aucklandSuburbs");
  return run(fd, (o) => fetchMutation(api.locations.addSuburbs, { names: [...AUCKLAND_SUBURBS] }, o), "Popular Auckland suburbs added.");
};
export const setSuburbEnabled = async (id: string, enabled: boolean, fd: FormData) => run(fd, (o) => fetchMutation(api.locations.setSuburbEnabled, { id, enabled }, o), enabled ? "Suburb enabled." : "Suburb disabled.");
export const removeSuburb = async (id: string, fd: FormData) => run(fd, (o) => fetchMutation(api.locations.removeSuburb, { id }, o), "Suburb removed.");

export const setAreaOpen = async (placeId: string, open: boolean, fd: FormData) => run(fd, (o) => fetchMutation(api.locations.setAreaOpen, { placeId, open }, o), open ? "Area opened." : "Area closed.");
export const resolveLocationReview = async (reviewId: string, placeId: string, fd: FormData) => run(fd, (o) => fetchMutation(api.locations.resolveReview, { reviewId, placeId }, o), "Location linked.");
export const dismissLocationReview = async (reviewId: string, fd: FormData) => run(fd, (o) => fetchMutation(api.locations.dismissReview, { reviewId }, o), "Review dismissed.");

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
export const createCategory = async (fd: FormData) => run(fd, (o) => fetchMutation(api.categories.create, { label: s(fd, "label"), icon: s(fd, "icon"), hue: s(fd, "hue"), parentId: s(fd, "parentId") || undefined, featured: fd.get("featured") === "on" }, o), "Category added.");
export const setCategoryFeatured = async (id: string, featured: boolean, fd: FormData) => run(fd, (o) => fetchMutation(api.categories.setFeatured, { id, featured }, o), featured ? "Shown on the homepage." : "Removed from the homepage.");
export const deleteCategory = async (id: string, fd: FormData) => run(fd, (o) => fetchMutation(api.categories.remove, { id }, o), "Category deleted.");
export const removeCategoryImage = async (id: string, fd: FormData) => run(fd, (o) => fetchMutation(api.categories.removeImage, { id }, o), "Image removed.");
export const addStarterCategories = async (fd: FormData) => run(fd, (o) => fetchMutation(api.categories.seedStarter, {}, o), "Starter categories added.");
export const updateCategory = async (fd: FormData) => run(fd, (o) => fetchMutation(api.categories.update, { id: s(fd, "id"), label: s(fd, "label"), icon: s(fd, "icon"), hue: s(fd, "hue") }, o), "Category updated.");
export const setCategoryEnabled = async (id: string, enabled: boolean, fd: FormData) => run(fd, (o) => fetchMutation(api.categories.setEnabled, { id, enabled }, o), enabled ? "Category enabled." : "Category disabled.");
export const moveCategory = async (id: string, direction: "up" | "down", fd: FormData) => run(fd, (o) => fetchMutation(api.categories.move, { id, direction }, o), "Order updated.");


// ---------- category requests ----------
const decideRequest = (fd: FormData, decision: "approve" | "assign" | "more_info" | "reject", ok: string) =>
  run(fd, (o) => fetchMutation(api.categoryRequests.decide, {
    requestId: s(fd, "id"), decision, note: s(fd, "note") || undefined,
    ...(decision === "assign" ? { categorySlug: s(fd, "categorySlug") } : {}),
    ...(decision === "approve" ? {
      label: s(fd, "label") || undefined, icon: s(fd, "icon") || undefined, hue: s(fd, "hue") || undefined,
      parentId: s(fd, "parentId") || undefined, featured: fd.get("featured") === "on",
    } : {}),
  }, o), ok);
export const approveCategoryRequest = async (fd: FormData) => decideRequest(fd, "approve", "Category created and the provider notified.");
export const assignCategoryRequest = async (fd: FormData) => decideRequest(fd, "assign", "Mapped to the existing category and the provider notified.");
export const askForMoreInfo = async (fd: FormData) => decideRequest(fd, "more_info", "Question sent to the provider.");
export const rejectCategoryRequest = async (fd: FormData) => decideRequest(fd, "reject", "Request declined and the provider notified.");

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";

const BACK = "/account";
function done(r: { ok: boolean; message?: string }, ok: string, hash = "") {
  revalidatePath("/", "layout");
  redirect(r.ok ? `${BACK}?ok=${ok}${hash}` : `${BACK}?err=${encodeURIComponent(r.message ?? "")}${hash}`);
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function saveProfile(fd: FormData) {
  done(await attempt(async () => fetchMutation(api.account.updateProfile, { name: s(fd, "name"), contactPhone: s(fd, "phone") || undefined }, await authOpts())), "profile");
}
export async function removePhoto() { done(await attempt(async () => fetchMutation(api.account.removePhoto, {}, await authOpts())), "photo"); }
export async function addAddress(fd: FormData) {
  done(await attempt(async () => fetchMutation(api.account.addAddress, {
    label: s(fd, "label"), address: s(fd, "address"), suburb: s(fd, "suburb"), accessNotes: s(fd, "notes") || undefined, makeDefault: fd.get("makeDefault") === "on",
  }, await authOpts())), "address", "#addresses");
}
export async function removeAddress(id: string) { done(await attempt(async () => fetchMutation(api.account.removeAddress, { id }, await authOpts())), "address-removed", "#addresses"); }
export async function makeDefault(id: string) { done(await attempt(async () => fetchMutation(api.account.setDefaultAddress, { id }, await authOpts())), "address-default", "#addresses"); }
export async function savePrefs(fd: FormData) {
  done(await attempt(async () => fetchMutation(api.account.setEmailPrefs, { updates: fd.get("updates") === "on", reminders: fd.get("reminders") === "on", reviews: fd.get("reviews") === "on" }, await authOpts())), "prefs", "#email-prefs");
}

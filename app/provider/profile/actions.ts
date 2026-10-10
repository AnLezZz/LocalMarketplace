"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";

const BACK = "/provider/profile";
function done(r: { ok: boolean; message?: string }, ok: string) {
  revalidatePath("/", "layout");
  redirect(r.ok ? `${BACK}?ok=${ok}` : `${BACK}?err=${encodeURIComponent(r.message ?? "")}`);
}

export async function saveProfile(fd: FormData) {
  const dollars = Number(fd.get("rate"));
  done(await attempt(async () => fetchMutation(api.providers.updateProfile, {
    name: String(fd.get("name") ?? ""), bio: String(fd.get("bio") ?? ""), category: String(fd.get("category") ?? ""), suburb: String(fd.get("suburb") ?? ""),
    rateCents: Math.round(dollars * 100), rateBasis: fd.get("basis") === "fixed" ? "fixed" : "hourly",
  }, await authOpts())), "saved");
}
export async function removeProfilePhoto() { done(await attempt(async () => fetchMutation(api.providers.removePhoto, {}, await authOpts())), "photo-removed"); }
export async function removeGalleryPhoto(id: string) { done(await attempt(async () => fetchMutation(api.providers.removeGalleryPhoto, { id }, await authOpts())), "gallery-removed"); }

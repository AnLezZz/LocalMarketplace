"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";

const BACK = "/provider/services";
const done = (r: { ok: boolean; message?: string }, back = BACK) => {
  revalidatePath(BACK);
  redirect(r.ok ? back : `${back}${back.includes("?") ? "&" : "?"}err=${encodeURIComponent(r.message ?? "")}`);
};

/** Creates a service, or updates it when the form carries an id. */
export async function saveService(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const priceType = ["fixed", "hourly", "quote"].includes(String(fd.get("priceType"))) ? (String(fd.get("priceType")) as "fixed" | "hourly" | "quote") : "fixed";
  const dollars = Number(fd.get("price"));
  const args = {
    name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? ""), priceType,
    priceCents: priceType === "quote" || !Number.isFinite(dollars) ? undefined : Math.round(dollars * 100),
    durationMinutes: Number(fd.get("duration")),
  };
  const r = await attempt(async () => id
    ? fetchMutation(api.services.update, { id, ...args }, await authOpts())
    : fetchMutation(api.services.create, args, await authOpts()));
  done(r, r.ok ? BACK : `${BACK}${id ? `?edit=${id}` : ""}`);
}

export async function setServiceEnabled(id: string, enabled: boolean) {
  done(await attempt(async () => fetchMutation(api.services.setEnabled, { id, enabled }, await authOpts())));
}

export async function archiveService(id: string) {
  done(await attempt(async () => fetchMutation(api.services.archive, { id }, await authOpts())));
}

export async function saveServiceAreas(fd: FormData) {
  const suburbs = String(fd.get("suburbs") ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  done(await attempt(async () => fetchMutation(api.providers.setServiceAreas, { suburbs }, await authOpts())), `${BACK}?ok=areas`);
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";
import { aucklandToDate } from "../../../lib/time";

const BACK = "/provider/availability";
function done(r: { ok: boolean; message?: string }, msg = "saved") {
  revalidatePath(BACK);
  redirect(r.ok ? `${BACK}?ok=${msg}` : `${BACK}?err=${encodeURIComponent(r.message ?? "")}`);
}

export async function saveHours(fd: FormData) {
  const num = (k: string) => (fd.get(k) === null || fd.get(k) === "" ? undefined : Number(fd.get(k)));
  const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday, enabled: fd.get(`en_${weekday}`) === "on",
    startMinute: num(`start_${weekday}`) ?? 540, endMinute: num(`end_${weekday}`) ?? 1020,
    breakStartMinute: num(`bs_${weekday}`), breakEndMinute: num(`be_${weekday}`),
  }));
  done(await attempt(async () => fetchMutation(api.availability.setHours, { hours }, await authOpts())));
}

export async function addBlock(fd: FormData) {
  const startsAt = aucklandToDate(String(fd.get("from"))).getTime();
  const endsAt = aucklandToDate(String(fd.get("to"))).getTime();
  if (isNaN(startsAt) || isNaN(endsAt)) redirect(`${BACK}?err=Pick+a+start+and+an+end`);
  done(await attempt(async () => fetchMutation(api.availability.addTimeOff, { startsAt, endsAt, reason: String(fd.get("reason") ?? "") }, await authOpts())), "blocked");
}

export async function removeBlock(id: string) {
  done(await attempt(async () => fetchMutation(api.availability.removeTimeOff, { id }, await authOpts())), "removed");
}

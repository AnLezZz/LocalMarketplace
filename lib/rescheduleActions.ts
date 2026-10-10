"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "./convex";
import { authOpts } from "./auth";
import { attempt } from "./actions";
import { aucklandToDate } from "./time";

type Role = "customer" | "provider";
const pathFor = (role: Role, bookingId: string) => (role === "customer" ? `/bookings/${bookingId}` : `/provider/bookings/${bookingId}`);
function back(role: Role, bookingId: string, err?: string): never {
  revalidatePath("/", "layout");
  const p = pathFor(role, bookingId);
  redirect(err ? `${p}?err=${encodeURIComponent(err)}` : p);
}

export async function proposeReschedule(role: Role, bookingId: string, fd: FormData) {
  const when = aucklandToDate(String(fd.get("when") ?? ""));
  if (isNaN(when.getTime())) back(role, bookingId, "Pick a date and time");
  const r = await attempt(async () => fetchMutation(api.reschedules.propose, { bookingId, newStartsAt: when.getTime(), note: String(fd.get("note") ?? "") || undefined }, await authOpts()));
  back(role, bookingId, r.ok ? undefined : r.message);
}

export async function respondReschedule(role: Role, bookingId: string, requestId: string, accept: boolean) {
  const r = await attempt(async () => fetchMutation(api.reschedules.respond, { requestId, accept }, await authOpts()));
  back(role, bookingId, !r.ok ? r.message : r.value.ok ? undefined : r.value.reason);
}

export async function withdrawReschedule(role: Role, bookingId: string, requestId: string) {
  const r = await attempt(async () => fetchMutation(api.reschedules.withdraw, { requestId }, await authOpts()));
  back(role, bookingId, r.ok ? undefined : r.message);
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";

/** Provider moves a booking. `to` and `back` are bound per button (button name/value is not delivered to server actions here). */
export async function transitionBooking(to: "accepted" | "declined" | "completed" | "cancelled", back: string, fd: FormData) {
  const r = await attempt(async () =>
    fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), to }, await authOpts()));
  revalidatePath("/provider");
  const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
  redirect(reason ? `${back}${back.includes("?") ? "&" : "?"}err=${encodeURIComponent(reason)}` : back);
}

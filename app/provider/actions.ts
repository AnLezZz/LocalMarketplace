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

export async function reportReview(fd: FormData) {
  const r = await attempt(async () => fetchMutation(api.reviews.report, { reviewId: String(fd.get("id")), reason: String(fd.get("reason") ?? "") }, await authOpts()));
  revalidatePath("/provider");
  redirect(r.ok ? "/provider/reviews?reported=1" : `/provider/reviews?err=${encodeURIComponent(r.message)}`);
}

/** Opens a dispute on one of the provider's bookings, then returns to its details page. */
export async function openProviderDispute(bookingId: string, fd: FormData) {
  const back = `/provider/bookings/${bookingId}`;
  const r = await attempt(async () => fetchMutation(api.disputes.open, { bookingId, reason: String(fd.get("reason") ?? "") }, await authOpts()));
  revalidatePath("/provider", "layout");
  redirect(r.ok ? back : `${back}?err=${encodeURIComponent(r.message)}`);
}

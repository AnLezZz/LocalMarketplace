"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import { attempt } from "../../../../lib/actions";

export async function submitReview(bookingId: string, fd: FormData) {
  const rating = Number(fd.get("rating"));
  const back = `/bookings/${bookingId}/review`;
  if (!rating) redirect(`${back}?err=${encodeURIComponent("Choose a star rating")}`);
  const r = await attempt(async () => fetchMutation(api.reviews.create, { bookingId, rating, text: String(fd.get("text") ?? "") }, await authOpts()));
  revalidatePath("/", "layout");
  redirect(r.ok ? "/bookings?tab=past&reviewed=1" : `${back}?err=${encodeURIComponent(r.message)}`);
}

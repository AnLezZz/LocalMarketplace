"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts, getMe } from "../../lib/auth";
import { attempt } from "../../lib/actions";

/** Heart button: saves or removes a provider, then returns to the page it was clicked on. */
export async function toggleFavourite(providerId: string, back: string) {
  if (!(await getMe())) redirect("/signin");
  const r = await attempt(async () => fetchMutation(api.favourites.toggle, { providerId }, await authOpts()));
  revalidatePath("/", "layout");
  redirect(r.ok ? back : `${back}${back.includes("?") ? "&" : "?"}err=${encodeURIComponent(r.message)}`);
}

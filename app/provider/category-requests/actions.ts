"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";

const BACK = "/provider/category-requests";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Asks for a category from the tracking page. The application form calls the same mutation from its own action. */
export async function submitCategoryRequest(fd: FormData) {
  const r = await attempt(async () => fetchMutation(api.categoryRequests.submit, {
    name: text(fd, "requestName"), description: text(fd, "requestDescription"), suggestedParentSlug: text(fd, "requestParent") || undefined,
  }, await authOpts()));
  revalidatePath(BACK);
  if (!r.ok) redirect(`${BACK}?err=${encodeURIComponent(r.message)}`);
  const similar = (r.value as { similar: { label: string }[] }).similar;
  redirect(`${BACK}?ok=sent${similar.length ? `&similar=${encodeURIComponent(similar.map((s) => s.label).join(", "))}` : ""}`);
}

export async function replyToRequest(id: string, fd: FormData) {
  const r = await attempt(async () => fetchMutation(api.categoryRequests.reply, { requestId: id, message: text(fd, "message") }, await authOpts()));
  revalidatePath(BACK);
  redirect(r.ok ? `${BACK}?ok=replied` : `${BACK}?err=${encodeURIComponent(r.message)}`);
}

import { redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api, CATEGORIES } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import { attempt } from "../../../../lib/actions";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const profile = await fetchQuery(api.providers.mine, {}, await authOpts());
  if (profile?.status === "approved") redirect("/provider");

  async function submit(fd: FormData) {
    "use server";
    const dollars = Number(fd.get("rate"));
    const r = await attempt(async () =>
      fetchMutation(api.providers.submitProfile, {
        name: String(fd.get("name") ?? ""),
        bio: String(fd.get("bio") ?? ""),
        category: String(fd.get("category") ?? ""),
        suburb: String(fd.get("suburb") ?? ""),
        rateCents: Math.round(dollars * 100),
        rateBasis: fd.get("basis") === "fixed" ? "fixed" : "hourly",
      }, await authOpts()));
    redirect(r.ok ? "/provider" : `/provider/register?err=${encodeURIComponent(r.message)}`);
  }

  return (
    <>
      <h1>{profile ? "Update your application" : "Become a provider"}</h1>
      <p className="muted">We review every application before it appears in search.</p>
      {err && <p className="msg" role="alert">{err}</p>}
      <form action={submit} className="stack">
        <input name="name" placeholder="Business or trading name" defaultValue={profile?.name} required maxLength={80} />
        <select name="category" defaultValue={profile?.category ?? ""} aria-label="Category" required>
          <option value="" disabled>Category</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="suburb" placeholder="Suburb" defaultValue={profile?.suburb} required maxLength={60} />
        <label>Rate in NZD
          <input name="rate" type="number" min={1} max={1000} step="0.01" defaultValue={profile ? profile.rateCents / 100 : undefined} required />
        </label>
        <select name="basis" defaultValue={profile?.rateBasis ?? "hourly"} aria-label="Rate basis">
          <option value="hourly">per hour</option>
          <option value="fixed">fixed price</option>
        </select>
        <textarea name="bio" placeholder="Tell customers about your experience" rows={5} defaultValue={profile?.bio} required maxLength={1000} />
        <button>{profile ? "Resubmit" : "Apply"}</button>
      </form>
    </>
  );
}

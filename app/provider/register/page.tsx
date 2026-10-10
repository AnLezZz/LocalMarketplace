import { redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { loadCategories, loadLocations } from "../../../lib/categories";
import SuburbOptions from "../../../components/SuburbOptions";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";
import Banner from "../../../components/Banner";
import CategoryPicker from "../../../components/CategoryPicker";
import "../../categories/categories.css";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const cats = await loadCategories();
  const places = await loadLocations();
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
        more: fd.getAll("more").map(String),
        suburb: String(fd.get("suburb") ?? ""),
        rateCents: Math.round(dollars * 100),
        rateBasis: fd.get("basis") === "fixed" ? "fixed" : "hourly",
      }, await authOpts()));
    redirect(r.ok ? "/provider" : `/provider/register?err=${encodeURIComponent(r.message)}`);
  }

  return (
    <div className="page page--narrow">
      <h1 className="page__title">{profile ? "Update your application" : "Become a provider"}</h1>
      <p className="page__sub">We review every application before it appears in search.</p>
      {err && <Banner tone="error">{err}</Banner>}
      <form action={submit} className="card card--pad form">
        <SuburbOptions suburbs={places.suburbs} />
        <div className="field">
          <label htmlFor="name" className="field__label">Business or trading name</label>
          <input id="name" name="name" defaultValue={profile?.name} required maxLength={80} autoComplete="organization" />
        </div>
        <CategoryPicker rows={cats.all} primary={profile?.category} more={profile?.categorySlugs} />
        <div className="form__row">
          <div className="field field--grow">
            <label htmlFor="suburb" className="field__label">Suburb</label>
            <input id="suburb" name="suburb" defaultValue={profile?.suburb} required maxLength={60} list="suburb-options" autoComplete="address-level2" />
          </div>
        </div>
        <div className="form__row">
          <div className="field field--grow">
            <label htmlFor="rate" className="field__label">Rate in NZD</label>
            <div className="affix">
              <span className="affix__pre" aria-hidden="true">$</span>
              <input id="rate" name="rate" type="number" min={1} max={1000} step="0.01" inputMode="decimal" defaultValue={profile ? profile.rateCents / 100 : undefined} required />
            </div>
          </div>
          <div className="field field--grow">
            <label htmlFor="basis" className="field__label">Rate basis</label>
            <select id="basis" name="basis" defaultValue={profile?.rateBasis ?? "hourly"}>
              <option value="hourly">per hour</option>
              <option value="fixed">fixed price</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="bio" className="field__label">About your business</label>
          <textarea id="bio" name="bio" placeholder="Tell customers about your experience" rows={5} defaultValue={profile?.bio} required maxLength={1000} />
        </div>
        <button className="btn btn--primary btn--block">{profile ? "Resubmit" : "Apply"}</button>
      </form>
    </div>
  );
}

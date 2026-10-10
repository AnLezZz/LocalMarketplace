import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import Image from "next/image";
import { api } from "../../../lib/convex";
import { loadCategories, loadLocations } from "../../../lib/categories";
import SuburbOptions from "../../../components/SuburbOptions";
import { authOpts } from "../../../lib/auth";
import { providerSidebarItems } from "../../../lib/providerNav";
import DashboardSidebar from "../../../components/dashboard/DashboardSidebar";
import Banner from "../../../components/Banner";
import ProviderPhoto from "../../../components/ProviderPhoto";
import PhotoUpload from "../../../components/PhotoUpload";
import { removeGalleryPhoto, removeProfilePhoto, saveProfile } from "./actions";
import "../../providers/[id]/booking.css";

export const dynamic = "force-dynamic";
const OK: Record<string, string> = { saved: "Profile saved.", "photo-removed": "Photo removed.", "gallery-removed": "Photo removed from your gallery." };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const cats = await loadCategories();
  const places = await loadLocations();
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");
  const gallery = (await fetchQuery(api.providers.galleryMine, {}, opts)) as { _id: string; url: string; caption?: string }[];
  const editable = profile.status === "approved";
  const hasUpload = !!profile.photo;

  return (
    <div className="d-layout">
      <DashboardSidebar portal="business" activeId="profile" user={{ name: profile.name, subtext: "View public profile", profileHref: `/providers/${profile._id}` }} items={providerSidebarItems()} />
      <div className="d-main">
        <header className="d-header">
          <div className="d-header__info">
            <h1 className="d-header__title">Profile</h1>
            <p className="d-header__sub">How customers see you. {editable ? "Changes go live straight away." : ""}</p>
          </div>
          {editable && <div className="d-header__actions"><Link href={`/providers/${profile._id}`} className="btn btn--secondary d-header__btn">View public profile</Link></div>}
        </header>
        {err && <Banner tone="error">{err}</Banner>}
        {ok && OK[ok] && <Banner tone="success">{OK[ok]}</Banner>}
        {profile.status === "suspended" && <Banner tone="error">Your listing is suspended, so you can&apos;t make changes. Reason: {profile.suspendedReason}</Banner>}
        {(profile.status === "pending" || profile.status === "rejected") && (
          <Banner tone="info">Your application is {profile.status === "pending" ? "being reviewed" : "waiting for changes"}. Update the details from the <Link href="/provider/register">application form</Link>. You can add photos here in the meantime.</Banner>
        )}

        <section className="card d-card" aria-labelledby="ph-h">
          <div className="d-card__head"><h2 id="ph-h" className="d-card__title">Profile photo</h2></div>
          <div className="pf-photo">
            <div className="pf-photo__img"><ProviderPhoto name={profile.name} photo={profile.photo} size={120} rounded={18} /></div>
            <div className="pf-photo__side">
              <p className="field__hint">A clear photo of you or your team. JPEG, PNG or WebP, up to 5 MB.</p>
              <div className="adm-act">
                {profile.status !== "suspended" && <PhotoUpload kind="profile" label={hasUpload ? "Replace photo" : "Upload photo"} />}
                {hasUpload && profile.status !== "suspended" && <form action={removeProfilePhoto}><button className="btn btn--danger btn--sm">Remove</button></form>}
              </div>
            </div>
          </div>
        </section>

        <section className="card d-card" aria-labelledby="det-h">
          <div className="d-card__head"><h2 id="det-h" className="d-card__title">Details</h2></div>
          <form action={saveProfile} className="form">
            <fieldset disabled={!editable} className="form__group">
              <div className="field"><label htmlFor="name" className="field__label">Business or trading name</label>
                <input id="name" name="name" defaultValue={profile.name} required maxLength={80} /></div>
              <div className="field"><label htmlFor="bio" className="field__label">About you</label>
                <textarea id="bio" name="bio" rows={5} defaultValue={profile.bio} required maxLength={1000} /></div>
              <div className="form__row">
                <div className="field field--grow"><label htmlFor="category" className="field__label">Main category</label>
                  <select id="category" name="category" defaultValue={profile.category}>{cats.all.filter((c) => c.enabled || c.slug === profile.category).map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></div>
                <div className="field field--grow"><label htmlFor="suburb" className="field__label">Your suburb</label>
                  <input id="suburb" name="suburb" defaultValue={profile.suburb} required maxLength={60} list="suburb-options" /><SuburbOptions suburbs={places.suburbs} /></div>
              </div>
              <div className="form__row">
                <div className="field field--grow"><label htmlFor="rate" className="field__label">General rate (NZD)</label>
                  <input id="rate" name="rate" type="number" min={1} max={1000} step="0.01" inputMode="decimal" defaultValue={profile.rateCents / 100} required /></div>
                <div className="field field--grow"><label htmlFor="basis" className="field__label">Charged</label>
                  <select id="basis" name="basis" defaultValue={profile.rateBasis}><option value="hourly">Per hour</option><option value="fixed">Fixed price</option></select></div>
              </div>
              <p className="field__hint">Your services can have their own prices. This rate is used when a customer books without choosing a service. <Link href="/provider/services">Manage services and service area</Link></p>
            </fieldset>
            {editable && <button className="btn btn--primary">Save changes</button>}
          </form>
        </section>

        <section className="card d-card" aria-labelledby="gal-h">
          <div className="d-card__head"><h2 id="gal-h" className="d-card__title">Work gallery</h2><span className="d-card__sub num">{gallery.length} of 6</span></div>
          {gallery.length === 0 ? <p className="field__hint">Show off your work. Up to 6 photos appear on your public profile once you&apos;re approved.</p> : (
            <ul className="pf-gallery">
              {gallery.map((g) => (
                <li key={g._id}>
                  <Image src={g.url} alt={g.caption ?? "Work photo"} width={240} height={180} className="pf-gallery__img" />
                  <form action={removeGalleryPhoto.bind(null, g._id)}><button className="btn btn--danger btn--sm" aria-label={`Remove photo ${g.caption ?? ""}`}>Remove</button></form>
                </li>
              ))}
            </ul>
          )}
          {gallery.length < 6 && profile.status !== "suspended" && <PhotoUpload kind="gallery" label="Add a photo" />}
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import Image from "next/image";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { loadLocations } from "../../lib/categories";
import SuburbOptions from "../../components/SuburbOptions";
import Avatar from "../../components/Avatar";
import Banner from "../../components/Banner";
import PhotoUpload from "../../components/PhotoUpload";
import { addAddress, makeDefault, removeAddress, removePhoto, savePrefs, saveProfile } from "./actions";
import "../bookings/bookings.css";
import "../providers/[id]/booking.css";
import "./account.css";
import AccountShell from "../../components/AccountShell";

export const dynamic = "force-dynamic";
const OK: Record<string, string> = {
  profile: "Profile saved.", photo: "Photo removed.", address: "Address saved.", "address-removed": "Address removed.", "address-default": "Default address updated.", prefs: "Email preferences saved.",
};
type Me = {
  name: string; email: string; role: string; contactPhone: string; photo: string | null;
  emailPrefs: { updates: boolean; reminders: boolean; reviews: boolean };
  addresses: { _id: string; label: string; address: string; suburb: string; accessNotes?: string; isDefault: boolean }[];
};

export default async function Account({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const me = (await fetchQuery(api.account.mine, {}, await authOpts())) as Me | null;
  const places = await loadLocations();
  if (!me) redirect("/signin");
  const roleHome = me.role === "admin" ? { href: "/admin", label: "Admin dashboard" } : me.role === "provider" ? { href: "/provider", label: "Provider dashboard" } : null;

  return (
    <AccountShell active="settings"><div className="acct-pane acct">
      <h1 className="page__title">Account settings</h1>
      <p className="page__sub">Manage your details, saved addresses and which emails you get.</p>
      {err && <Banner tone="error">{err}</Banner>}
      {ok && OK[ok] && <Banner tone="success">{OK[ok]}</Banner>}

      <section className="card card--pad" aria-labelledby="pf-h">
        <h2 id="pf-h" className="card__title">Profile</h2>
        <div className="acct__photo">
          {me.photo ? <Image src={me.photo} alt="" width={88} height={88} className="acct__img" /> : <Avatar name={me.name || me.email} size={88} />}
          <div className="acct__photoside">
            <div className="adm-act">
              <PhotoUpload kind="account" label={me.photo ? "Change photo" : "Upload photo"} />
              {me.photo && <form action={removePhoto}><button className="btn btn--danger btn--sm">Remove</button></form>}
            </div>
            <p className="field__hint">JPEG, PNG or WebP, up to 5 MB.</p>
          </div>
        </div>
        <form action={saveProfile} className="form">
          <div className="field"><label htmlFor="name" className="field__label">Full name</label>
            <input id="name" name="name" defaultValue={me.name} required maxLength={80} autoComplete="name" /></div>
          <div className="field"><label htmlFor="email" className="field__label">Email</label>
            <input id="email" value={me.email} readOnly aria-describedby="email-hint" /><p id="email-hint" className="field__hint">This is the address you sign in with. It can&apos;t be changed here yet.</p></div>
          <div className="field"><label htmlFor="phone" className="field__label">Phone (optional)</label>
            <input id="phone" name="phone" type="tel" defaultValue={me.contactPhone} autoComplete="tel" inputMode="tel" placeholder="021 123 4567" />
            <p className="field__hint">Only shared with a provider when you choose to on a booking.</p></div>
          <button className="btn btn--forest">Save changes</button>
        </form>
        {roleHome && <p className="field__hint">You also have a <Link href={roleHome.href}>{roleHome.label}</Link>.</p>}
      </section>

      <section className="card card--pad" id="addresses" aria-labelledby="ad-h">
        <h2 id="ad-h" className="card__title">Saved addresses</h2>
        <p className="field__hint">The default one fills in the booking form for you. Up to 5.</p>
        {me.addresses.length === 0 ? <p className="field__hint">No saved addresses yet.</p> : (
          <ul className="acct__addrs">
            {me.addresses.map((a) => (
              <li key={a._id} className="acct__addr">
                <div><strong>{a.label}</strong>{a.isDefault && <span className="pill pill--completed">Default</span>}
                  <span>{a.address}, {a.suburb}</span>{a.accessNotes && <small>{a.accessNotes}</small>}</div>
                <div className="adm-act">
                  {!a.isDefault && <form action={makeDefault.bind(null, a._id)}><button className="btn btn--secondary btn--sm">Make default</button></form>}
                  <form action={removeAddress.bind(null, a._id)}><button className="btn btn--danger btn--sm" aria-label={`Remove ${a.label}`}>Remove</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {me.addresses.length < 5 && (
          <details className="rv__report" open={me.addresses.length === 0}>
            <summary>Add an address</summary>
            <form action={addAddress} className="form">
              <div className="form__row">
                <div className="field field--grow"><label htmlFor="label" className="field__label">Name</label><input id="label" name="label" required maxLength={30} placeholder="Home" /></div>
                <div className="field field--grow"><label htmlFor="suburb" className="field__label">Suburb</label><input id="suburb" name="suburb" required maxLength={60} placeholder="Ponsonby" autoComplete="address-level2" list="suburb-options" /><SuburbOptions suburbs={places.suburbs} /></div>
              </div>
              <div className="field"><label htmlFor="address" className="field__label">Street address</label><input id="address" name="address" required maxLength={200} placeholder="12 Ponsonby Road" autoComplete="street-address" /></div>
              <div className="field"><label htmlFor="notes" className="field__label">Access instructions (optional)</label><textarea id="notes" name="notes" rows={2} maxLength={500} placeholder="Gate code, parking, pets" /></div>
              {me.addresses.length > 0 && <label className="bk__check"><input type="checkbox" name="makeDefault" /><span><strong>Make this my default address</strong></span></label>}
              <button className="btn btn--secondary">Save address</button>
            </form>
          </details>
        )}
      </section>

      <section className="card card--pad" id="email-prefs" aria-labelledby="em-h">
        <h2 id="em-h" className="card__title">Email notifications</h2>
        <p className="field__hint">You always see everything inside Localo. These switches only control emails.</p>
        <form action={savePrefs} className="form">
          <label className="bk__check"><input type="checkbox" name="updates" defaultChecked={me.emailPrefs.updates} /><span><strong>Booking updates</strong>Requests, accepted or declined bookings, quotes and disputes.</span></label>
          <label className="bk__check"><input type="checkbox" name="reminders" defaultChecked={me.emailPrefs.reminders} /><span><strong>Reminders</strong>A heads-up the day before an accepted booking.</span></label>
          <label className="bk__check"><input type="checkbox" name="reviews" defaultChecked={me.emailPrefs.reviews} /><span><strong>Reviews and moderation</strong>New reviews, and decisions on reports.</span></label>
          <p className="field__hint">Important account messages, such as a suspension notice, are always emailed.</p>
          <button className="btn btn--secondary">Save preferences</button>
        </form>
      </section>

      <section className="card card--pad" aria-labelledby="sec-h">
        <h2 id="sec-h" className="card__title">Password</h2>
        <p className="field__hint">To change your password, sign out and use &ldquo;Forgot your password?&rdquo; on the sign-in page. We&apos;ll email you a code.</p>
      </section>
    </div></AccountShell>
  );
}

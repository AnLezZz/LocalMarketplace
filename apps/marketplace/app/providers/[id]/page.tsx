import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts, getMe } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";
import Icon from "../../../components/Icon";
import Avatar from "../../../components/Avatar";
import Banner from "../../../components/Banner";
import { Rating } from "../../../components/Pill";
import { categoryMeta } from "../../../components/categories";
import { rate } from "../../../components/format";

export const dynamic = "force-dynamic";
const TZ = "Pacific/Auckland";

// Convert a datetime-local value (Auckland wall time) to a UTC instant.
function aucklandToDate(local: string): Date {
  const guess = new Date(local + "Z");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(guess);
  const off = parts.find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
  return new Date(`${local}:00${off}`);
}

export default async function Provider({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { id } = await params;
  const { sent, error } = await searchParams;
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();
  const me = await getMe();

  async function submit(fd: FormData) {
    "use server";
    const startsAt = aucklandToDate(String(fd.get("start")));
    const hours = Math.max(1, Math.min(12, Number(fd.get("hours")) || 1));
    const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
    if (isNaN(startsAt.getTime()) || startsAt < new Date()) redirect(`/providers/${id}?error=Pick+a+future+time`);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (!name || !description) redirect(`/providers/${id}?error=Fill+in+all+fields`);
    const r = await attempt(async () =>
      fetchMutation(api.bookings.create, { providerId: id, customerName: name, description, startsAt: startsAt.getTime(), endsAt: endsAt.getTime() }, await authOpts()));
    redirect(r.ok ? `/providers/${id}?sent=1` : `/providers/${id}?error=${encodeURIComponent(r.message)}`);
  }

  const price = rate(p.rateCents, p.rateBasis);
  const cat = categoryMeta(p.category);

  return (
    <div className="page page--narrow">
      <Link href="/" className="back"><Icon name="chevronLeft" size={20} />All pros</Link>

      <section className="card profile">
        <Avatar name={p.name} size={72} />
        <div className="profile__id">
          <h1 className="profile__name">{p.name}</h1>
          <div className="profile__meta">
            <span className={`cat-dot cat-dot--${cat.hue}`}><Icon name={cat.icon} size={16} /></span>
            {cat.label} · {p.suburb}
          </div>
          <Rating avg={p.ratingAvg} count={p.reviewCount} />
        </div>
        <div className="profile__price">
          <span className="profile__amount num">{price.amount}</span>
          <span className="profile__unit">{p.rateBasis === "hourly" ? "per hour" : "fixed price"}</span>
        </div>
      </section>

      <section className="card card--pad" aria-labelledby="about-h">
        <h2 id="about-h" className="card__title">About</h2>
        <p className="prose">{p.bio}</p>
        <p className="note"><Icon name="info" size={18} />Pay the provider directly; LocalHub does not handle payment.</p>
      </section>

      <section className="card card--pad" aria-labelledby="book-h">
        <h2 id="book-h" className="card__title">Request a booking</h2>
        {sent && <Banner tone="success">Request sent. {p.name} will accept or decline. A request does not guarantee the slot.</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
        {me ? (
          <form action={submit} className="form">
            <fieldset className="form__group">
              <legend className="form__legend">When</legend>
              <div className="form__row">
                <div className="field field--grow">
                  <label htmlFor="start" className="field__label">Start (Auckland time)</label>
                  <input id="start" name="start" type="datetime-local" required />
                </div>
                <div className="field field--hours">
                  <label htmlFor="hours" className="field__label">Hours</label>
                  <input id="hours" name="hours" type="number" min={1} max={12} defaultValue={2} inputMode="numeric" />
                </div>
              </div>
            </fieldset>
            <fieldset className="form__group">
              <legend className="form__legend">Details</legend>
              <div className="field">
                <label htmlFor="name" className="field__label">Your name</label>
                <input id="name" name="name" placeholder="Your name" defaultValue={me.name ?? ""} autoComplete="name" required />
              </div>
              <div className="field">
                <label htmlFor="description" className="field__label">Describe the job</label>
                <textarea id="description" name="description" placeholder="What needs doing, and anything the provider should know" rows={4} required />
              </div>
            </fieldset>
            <button className="btn btn--primary btn--block">Send request</button>
          </form>
        ) : (
          <div className="signin-prompt">
            <span className="signin-prompt__icon"><Icon name="user" size={24} /></span>
            <p><strong>Sign in to request a booking.</strong> You can see your requests and their status once you are signed in.</p>
            <Link href="/signin" className="btn btn--primary btn--block">Sign in</Link>
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts, getMe } from "../../../../lib/auth";
import { attempt } from "../../../../lib/actions";
import BookingForm from "../BookingForm";
import "../booking.css";
import Icon from "../../../../components/Icon";
import ProviderPhoto from "../../../../components/ProviderPhoto";
import Banner from "../../../../components/Banner";
import { Rating } from "../../../../components/Pill";
import { categoryMeta } from "../../../../components/categories";
import { rate } from "../../../../components/format";

export const dynamic = "force-dynamic";
const TZ = "Pacific/Auckland";

// Convert a datetime-local value (Auckland wall time) to a UTC instant.
function aucklandToDate(local: string): Date {
  const guess = new Date(local + "Z");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(guess);
  const off = parts.find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
  return new Date(`${local}:00${off}`);
}

// Auckland wall time now, "YYYY-MM-DDTHH:mm".
function aucklandNow(): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export default async function Book({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; error?: string; service?: string }> }) {
  const { id } = await params;
  const { sent, error, service } = await searchParams;
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();
  const me = await getMe();
  const services = ((await fetchQuery(api.services.listForProvider, { providerId: id })) as any[]).map((s) => ({ id: s._id as string, name: s.name, description: s.description, priceType: s.priceType, priceCents: s.priceCents, durationMinutes: s.durationMinutes }));

  async function submit(fd: FormData) {
    "use server";
    const startsAt = aucklandToDate(String(fd.get("start")));
    const hours = Math.max(0.5, Math.min(12, Number(fd.get("hours")) || 1));
    const serviceId = String(fd.get("serviceId") ?? "") || undefined;
    const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
    if (isNaN(startsAt.getTime()) || startsAt < new Date()) redirect(`/providers/${id}/book?error=Pick+a+future+time`);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (!name || !description) redirect(`/providers/${id}/book?error=Fill+in+all+fields`);
    const r = await attempt(async () =>
      fetchMutation(api.bookings.create, { providerId: id, customerName: name, description, startsAt: startsAt.getTime(), endsAt: endsAt.getTime(), serviceId }, await authOpts()));
    redirect(r.ok ? `/providers/${id}/book?sent=1` : `/providers/${id}/book?error=${encodeURIComponent(r.message)}`);
  }

  const price = rate(p.rateCents, p.rateBasis);
  const cat = categoryMeta(p.category);

  const first = (me?.name ?? "").trim();

  return (
    <div className="page page--wide bk">
      <Link href={`/providers/${id}`} className="back"><Icon name="chevronLeft" size={20} />Back to profile</Link>

      <section className="bk__card bk__hero">
        <ProviderPhoto name={p.name} photo={p.photo} size={96} rounded={18} />
        <div className="bk__heroid">
          <h1 className="bk__title">{p.name}</h1>
          <div className="bk__meta">
            <span className={`cat-dot cat-dot--${cat.hue}`}><Icon name={cat.icon} size={16} /></span>{cat.label}
            <span className="bk__dot" /><Icon name="pin" size={16} />{p.suburb}
          </div>
          <Rating avg={p.ratingAvg} count={p.reviewCount} />
        </div>
        <div className="bk__price"><span className="num">{price.amount}</span><small>{p.rateBasis === "hourly" ? "per hour" : "fixed price"}</small></div>
      </section>
      <p className="bk__about">{p.bio}</p>

      {error && <Banner tone="error">{error}</Banner>}

      {sent ? (
        <section className="bk__card bk__done">
          <span className="bk__done-icon"><Icon name="check" size={32} /></span>
          <h2 className="bk__h">Booking request sent!</h2>
          <p className="bk__sub">{p.name} has your request and will accept or decline. A request does not guarantee the slot.</p>
          <div className="bk__actions">
            <Link href="/bookings" className="btn btn--forest bk__go">View my bookings</Link>
            <Link href="/" className="btn btn--secondary">Back to home</Link>
          </div>
          <ol className="bk__next">
            <li><b>1</b><span><strong>{p.name} reviews your request</strong>They accept or decline it.</span></li>
            <li><b>2</b><span><strong>Check My bookings</strong>Its status updates there.</span></li>
            <li><b>3</b><span><strong>Meet and pay directly</strong>Localo does not collect payment.</span></li>
          </ol>
        </section>
      ) : me ? (
        <BookingForm action={submit} services={services} initialServiceId={service} now={aucklandNow()} defaultName={first} provider={{ name: p.name, category: cat.label, suburb: p.suburb, rateCents: p.rateCents, rateBasis: p.rateBasis }} />
      ) : (
        <section className="bk__card signin-prompt">
          <span className="signin-prompt__icon"><Icon name="user" size={24} /></span>
          <p><strong>Sign in to request a booking.</strong> You can see your requests and their status once you are signed in.</p>
          <Link href="/signin" className="btn btn--forest btn--block">Sign in</Link>
        </section>
      )}
    </div>
  );
}

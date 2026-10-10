import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts, getMe } from "../../../../lib/auth";
import { attempt } from "../../../../lib/actions";
import BookingForm, { type BookResult } from "../BookingForm";
import "../booking.css";
import { aucklandNow, aucklandToDate } from "../../../../lib/time";
import Icon from "../../../../components/Icon";
import ProviderPhoto from "../../../../components/ProviderPhoto";
import Banner from "../../../../components/Banner";
import { Rating } from "../../../../components/Pill";
import { loadCategories, loadLocations, metaIn } from "../../../../lib/categories";
import { rate } from "../../../../components/format";

export const dynamic = "force-dynamic";

export default async function Book({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; service?: string }> }) {
  const { id } = await params;
  const { error, service } = await searchParams;
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();
  const me = await getMe();
  const acct = me ? ((await fetchQuery(api.account.mine, {}, await authOpts())) as { contactPhone: string; addresses: any[] } | null) : null;
  const av = (await fetchQuery(api.availability.forProvider, { providerId: id, days: 14 })) as { days: { date: string; windows: [number, number][]; busy: [number, number][] }[] };
  const cats = await loadCategories();
  const services = ((await fetchQuery(api.services.listForProvider, { providerId: id })) as any[]).map((s) => ({
    id: s._id as string, name: s.name, description: s.description, priceType: s.priceType, priceCents: s.priceCents, durationMinutes: s.durationMinutes,
    categoryLabel: s.categorySlug ? cats.all.find((c) => c.slug === s.categorySlug)?.label : undefined, locationMode: s.locationMode, venue: s.venue, onlineNote: s.onlineNote,
  }));

  /** Returns an error for the form to show (it keeps everything the customer entered); a success goes to the confirmation page. */
  async function submit(_prev: BookResult, fd: FormData): Promise<BookResult> {
    "use server";
    const startsAt = aucklandToDate(String(fd.get("start")));
    const hours = Math.max(0.5, Math.min(12, Number(fd.get("hours")) || 1));
    const serviceId = String(fd.get("serviceId") ?? "") || undefined;
    const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
    if (isNaN(startsAt.getTime()) || startsAt < new Date()) return { error: "That time has passed. Please pick another time." };
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (!name || !description) return { error: "Fill in your name and describe the job." };
    const choice = String(fd.get("locationChoice") ?? "");
    const r = await attempt(async () =>
      fetchMutation(api.bookings.create, {
        providerId: id, customerName: name, description, startsAt: startsAt.getTime(), endsAt: endsAt.getTime(), serviceId,
        ...(choice === "customer" || choice === "provider" || choice === "online" ? { locationChoice: choice } : {}),
        address: String(fd.get("address") ?? "") || undefined, suburb: String(fd.get("suburb") ?? "") || undefined, accessNotes: String(fd.get("accessNotes") ?? "") || undefined,
        shareContact: fd.get("shareContact") === "on", phone: String(fd.get("phone") ?? "") || undefined,
      }, await authOpts()));
    if (!r.ok) return { error: r.message };
    redirect(`/bookings/${r.value}/confirmation`);
  }

  const price = rate(p.rateCents, p.rateBasis);
  const places = await loadLocations();
  const cat = metaIn(cats.all, p.category);

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

      {me ? (
        <BookingForm action={submit} backHref={`/providers/${id}`} city={places.city} suburbOptions={places.suburbs} savedAddresses={acct?.addresses ?? []} savedPhone={acct?.contactPhone ?? ""} availability={av.days} services={services} initialServiceId={service} now={aucklandNow()} defaultName={first} provider={{ name: p.name, category: cat.label, suburb: p.suburb, rateCents: p.rateCents, rateBasis: p.rateBasis, serviceSuburbs: p.serviceSuburbs }} />
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

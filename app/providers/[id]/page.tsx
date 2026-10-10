import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../lib/convex";
import Icon from "../../../components/Icon";
import ProviderPhoto from "../../../components/ProviderPhoto";
import { Rating } from "../../../components/Pill";
import { categoryMeta } from "../../../components/categories";
import { durationLabel, priceLabel, rate } from "../../../components/format";
import "./booking.css";
import FavouriteButton from "../../../components/FavouriteButton";
import { authOpts } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function Provider({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await fetchQuery(api.providers.get, { id });
  if (!p) notFound();

  const services = (await fetchQuery(api.services.listForProvider, { providerId: id })) as { _id: string; name: string; description: string; priceType: string; priceCents?: number; durationMinutes: number }[];
  const saved = ((await fetchQuery(api.favourites.mineIds, {}, await authOpts())) as string[]).includes(id);
  const reviews = (await fetchQuery(api.reviews.forProvider, { providerId: id })) as { _id: string; customerName: string; rating: number; text: string; at: number }[];
  const price = rate(p.rateCents, p.rateBasis);
  const cat = categoryMeta(p.category);
  const bookHref = `/providers/${id}/book`;

  return (
    <div className="page page--wide bk">
      <Link href="/search" className="back"><Icon name="chevronLeft" size={20} />Back to results</Link>

      <section className="bk__card bk__hero">
        <ProviderPhoto name={p.name} photo={p.photo} size={112} rounded={18} />
        <div className="bk__heroid">
          <h1 className="bk__title">{p.name}</h1>
          <div className="bk__meta">
            <span className={`cat-dot cat-dot--${cat.hue}`}><Icon name={cat.icon} size={16} /></span>{cat.label}
            <span className="bk__dot" /><Icon name="pin" size={16} />{p.suburb}, Auckland
          </div>
          <Rating avg={p.ratingAvg} count={p.reviewCount} />
        </div>
        <div className="bk__price"><span className="num">{price.amount}</span><small>{p.rateBasis === "hourly" ? "per hour" : "fixed price"}</small></div>
        <FavouriteButton providerId={id} saved={saved} back={`/providers/${id}`} name={p.name} />
        <Link href={bookHref} className="btn btn--forest">Book now</Link>
      </section>

      <div className="bk__grid">
        <div className="bk__main">
          <section className="bk__card" aria-labelledby="about-h">
            <h2 id="about-h" className="bk__h">About</h2>
            <p className="bk__about bk__about--in">{p.bio}</p>
          </section>
          <section className="bk__card" aria-labelledby="svc-h">
            <h2 id="svc-h" className="bk__h">Services</h2>
            {services.length === 0 ? (
              <div className="bk__svc">
                <span className={`cat-dot cat-dot--${cat.hue}`}><Icon name={cat.icon} size={20} /></span>
                <div><strong>{cat.label}</strong><small>{p.rateBasis === "hourly" ? "Charged per hour" : "Fixed price per job"} · {p.suburb}</small></div>
                <span className="bk__svcprice">From <strong className="num">{price.amount}</strong></span>
                <Link href={bookHref} className="btn btn--forest btn--sm">Select</Link>
              </div>
            ) : services.map((s) => (
              <div key={s._id} className="bk__svc">
                <span className={`cat-dot cat-dot--${cat.hue}`}><Icon name={cat.icon} size={20} /></span>
                <div><strong>{s.name}</strong><small>{s.description ? `${s.description} · ` : ""}{durationLabel(s.durationMinutes)}</small></div>
                <span className="bk__svcprice"><strong className="num">{priceLabel(s)}</strong></span>
                <Link href={`${bookHref}?service=${s._id}`} className="btn btn--forest btn--sm">Select</Link>
              </div>
            ))}
          </section>
          <section className="bk__card" aria-labelledby="rev-h">
            <h2 id="rev-h" className="bk__h">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="bk__sub">No written reviews yet. Customers can review a job once it is completed.</p>
            ) : (
              <ul className="rv-list">
                {reviews.map((r) => (
                  <li key={r._id} className="rv">
                    <div className="rv__head"><strong>{r.customerName}</strong><span className="rv__stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                      <time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" })}</time></div>
                    {r.text && <p>{r.text}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="bk__side">
          <section className="bk__card">
            <h2 className="bk__h bk__h--sm">Good to know</h2>
            <ul className="bk__why">
              <li><Icon name="calendar" size={20} /><span><strong>Request a time</strong>The provider accepts or declines.</span></li>
              <li><Icon name="shield" size={20} /><span><strong>Pay directly</strong>Localo does not collect or hold payment.</span></li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../lib/convex";
import { authOpts } from "../../../../lib/auth";
import Icon from "../../../../components/Icon";
import Banner from "../../../../components/Banner";
import { bookingWindow } from "../../../../components/format";
import { submitReview } from "./actions";
import "../../bookings.css";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const opts = await authOpts();
  const mine = (await fetchQuery(api.bookings.listMine, {}, opts)) as any[];
  const b = mine.find((x) => x._id === id);
  if (!b || b.status !== "completed") notFound();
  const reviewed = (await fetchQuery(api.reviews.mine, {}, opts)) as { bookingId: string }[];
  if (reviewed.some((r) => r.bookingId === id)) redirect("/bookings?tab=past");
  const w = bookingWindow(b.startsAt, b.endsAt);

  return (
    <div className="page page--narrow">
      <Link href="/bookings?tab=past" className="back"><Icon name="chevronLeft" size={20} />My bookings</Link>
      <h1 className="page__title">Write a review</h1>
      <p className="page__sub">Share your experience with {b.providerName}{b.serviceName ? ` (${b.serviceName})` : ""} on {w.day}.</p>
      {err && <Banner tone="error">{err}</Banner>}
      <form action={submitReview.bind(null, id)} className="card card--pad form">
        <fieldset className="form__group stars">
          <legend className="form__legend">Your rating</legend>
          <div className="stars__row">
            {/* Highest first: the row is reversed in CSS so stars read 1 to 5 and "later siblings" are the lower ones. */}
            {[5, 4, 3, 2, 1].map((n) => (
              <label key={n} className="stars__opt">
                <input type="radio" name="rating" value={n} required />
                <span aria-hidden="true">★</span>
                <span className="sr-only">{n} {n === 1 ? "star" : "stars"}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="text" className="field__label">Tell us about your experience (optional)</label>
          <textarea id="text" name="text" rows={5} maxLength={1000} placeholder="What went well? Anything others should know?" />
        </div>
        <button className="btn btn--forest">Submit review</button>
      </form>
    </div>
  );
}

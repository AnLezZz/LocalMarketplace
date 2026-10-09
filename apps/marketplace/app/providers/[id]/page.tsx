import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { meta, price } from "../../../lib/ui";
import { Hero, Reveal } from "../../../components/motion";

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
  const m = meta(p.category);

  async function submit(fd: FormData) {
    "use server";
    const startsAt = aucklandToDate(String(fd.get("start")));
    const hours = Math.max(1, Math.min(12, Number(fd.get("hours")) || 1));
    const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
    if (isNaN(startsAt.getTime()) || startsAt < new Date()) redirect(`/providers/${id}?error=Pick+a+future+time`);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !description) redirect(`/providers/${id}?error=Fill+in+all+fields`);
    try {
      await fetchMutation(api.bookings.create, { providerId: id, customerName: name, customerEmail: email, description, startsAt: startsAt.getTime(), endsAt: endsAt.getTime() });
    } catch {
      redirect(`/providers/${id}?error=Could+not+send+request`);
    }
    redirect(`/providers/${id}?sent=1`);
  }

  return (
    <div className="wrap">
      <Link href="/#browse" className="back">← All providers</Link>
      <div className="pgrid">
        <Hero>
          <div className="phead">
            <div className="avatar" style={{ background: `hsl(${m.hue} 55% 90%)` }}>{m.emoji}</div>
            <div>
              <h1>{p.name}</h1>
              <div className="meta" style={{ marginTop: 8 }}><span className="tag">{p.category}</span><span>{p.suburb}</span></div>
            </div>
          </div>
          <div className="facts">
            <div className="fact"><b>★ {p.ratingAvg}</b><span>{p.reviewCount} reviews</span></div>
            <div className="fact"><b>{price(p)}</b><span>{p.rateBasis === "hourly" ? "hourly rate" : "fixed price"}</span></div>
            <div className="fact"><b>{p.suburb}</b><span>service area</span></div>
          </div>
          <h2 style={{ fontSize: 32, marginBottom: 8 }}>About</h2>
          <p style={{ color: "var(--muted)", fontSize: 17 }}>{p.bio}</p>
          <div className="notice" style={{ marginTop: 24 }}>You pay {p.name} directly. Localo does not collect, hold or guarantee payment. A request does not guarantee the time slot until the provider accepts.</div>
        </Hero>

        <Reveal delay={0.15}>
          <div className="book">
            <h2>Request a booking</h2>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>Usually answered within a day.</div>
            {sent && <div className="toast ok">✓ Request sent. {p.name} will accept or decline.</div>}
            {error && <div className="toast err">{error}</div>}
            <form action={submit} className="form">
              <label className="field">Your name<input name="name" placeholder="Jane Smith" required /></label>
              <label className="field">Email<input name="email" type="email" placeholder="jane@example.com" required /></label>
              <div className="two">
                <label className="field">Start (Auckland)<input name="start" type="datetime-local" required /></label>
                <label className="field">Hours<input name="hours" type="number" min={1} max={12} defaultValue={2} /></label>
              </div>
              <label className="field">The job<textarea name="description" rows={4} placeholder="Tell them what you need done" required /></label>
              <button className="btn">Send request →</button>
            </form>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

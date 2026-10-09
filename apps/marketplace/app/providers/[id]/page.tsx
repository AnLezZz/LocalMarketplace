import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, providers, createRequest } from "@localhub/db";

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
  const [p] = await getDb().select().from(providers).where(and(eq(providers.id, id), eq(providers.approved, true)));
  if (!p) notFound();

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
    await createRequest({ providerId: id, customerName: name, customerEmail: email, description, startsAt, endsAt });
    redirect(`/providers/${id}?sent=1`);
  }

  return (
    <>
      <h1>{p.name}</h1>
      <p className="muted">{p.category} · {p.suburb} · ★ {p.ratingAvg} ({p.reviewCount} reviews)</p>
      <p>{p.bio}</p>
      <p><strong>From ${(p.rateCents / 100).toFixed(0)}{p.rateBasis === "hourly" ? "/hr" : " fixed"}</strong>. Pay the provider directly; LocalHub does not handle payment.</p>
      <h2>Request a booking</h2>
      {sent && <p className="msg">Request sent. {p.name} will accept or decline. A request does not guarantee the slot.</p>}
      {error && <p className="msg">{error}</p>}
      <form action={submit} className="stack">
        <input name="name" placeholder="Your name" required />
        <input name="email" type="email" placeholder="Email" required />
        <label>Start (Auckland time)<input name="start" type="datetime-local" required /></label>
        <label>Hours<input name="hours" type="number" min={1} max={12} defaultValue={2} /></label>
        <textarea name="description" placeholder="Describe the job" rows={4} required />
        <button>Send request</button>
      </form>
    </>
  );
}

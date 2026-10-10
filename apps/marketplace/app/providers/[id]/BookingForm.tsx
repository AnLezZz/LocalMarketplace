"use client";
import { useState } from "react";
import Icon from "../../../components/Icon";
import { dollars, durationLabel, priceLabel } from "../../../components/format";

const SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const DAYS = 14;
const pad = (n: number) => String(n).padStart(2, "0");
const label = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

export type ServiceOption = { id: string; name: string; description: string; priceType: "fixed" | "hourly" | "quote"; priceCents?: number; durationMinutes: number };

type Props = {
  services: ServiceOption[];
  initialServiceId?: string;
  action: (fd: FormData) => void | Promise<void>;
  /** Auckland wall time now, "YYYY-MM-DDTHH:mm". Slots before it are disabled. */
  now: string;
  defaultName: string;
  provider: { name: string; category: string; suburb: string; rateCents: number; rateBasis: string };
};

/** Day strip + time slots + details. Emits the same `start`/`hours`/`name`/`description` fields the server action reads. */
export default function BookingForm({ action, now, defaultName, provider, services, initialServiceId }: Props) {
  const [today, nowTime] = now.split("T");
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { key: d.toISOString().slice(0, 10), wd: d.toLocaleDateString("en-NZ", { weekday: "short", timeZone: "UTC" }), dm: d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" }), long: d.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) };
  });
  const isPast = (k: string, h: number) => k === today && `${pad(h)}:00` <= nowTime;
  // Late in the day every slot for today is gone, so start on the first day with a free one.
  const firstOpen = Math.max(0, days.findIndex((d) => SLOTS.some((h) => !isPast(d.key, h))));
  const [page, setPage] = useState(0);
  const [day, setDay] = useState(days[firstOpen].key);
  const [hour, setHour] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState(services.find((x) => x.id === initialServiceId)?.id ?? services[0]?.id ?? "");
  const service = services.find((x) => x.id === serviceId);
  const [hours, setHours] = useState(service ? service.durationMinutes / 60 : 2);
  const [desc, setDesc] = useState("");
  const [name, setName] = useState(defaultName);
  const [step, setStep] = useState(0);
  const detailsOk = name.trim() !== "" && desc.trim() !== "";

  const picked = days.find((d) => d.key === day)!;
  const visible = days.slice(page * 7, page * 7 + 7);
  // With services, price comes from the chosen one; otherwise from the provider's general rate.
  const priceType = service ? service.priceType : provider.rateBasis;
  const unitCents = service ? (service.priceCents ?? 0) : provider.rateCents;
  const hourly = priceType === "hourly";
  const price = hourly ? unitCents * hours : unitCents;
  const end = hour !== null ? hour + hours : null;
  const fmtHours = (h: number) => durationLabel(Math.round(h * 60));

  return (
    <form action={action} className="bk__grid" onSubmit={(e) => { if (step < 2) { e.preventDefault(); if (step === 0 ? hour !== null : detailsOk) setStep(step + 1); } }}>
      <input type="hidden" name="start" value={hour !== null ? `${day}T${pad(hour)}:00` : ""} />
      <input type="hidden" name="hours" value={hours} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={desc} />
      <ol className="bk__steps" aria-label="Booking steps">
        {["Date & Time", "Details", "Confirm"].map((t, i) => (
          <li key={t} aria-current={i === step ? "step" : undefined} data-done={i < step}>
            {i < step ? <button type="button" onClick={() => setStep(i)}>{i + 2}. {t}</button> : <span>{i + 2}. {t}</span>}
          </li>
        ))}
      </ol>
      <div className="bk__main">
        {step === 0 && services.length > 0 && <section className="bk__card" aria-labelledby="sv-h">
          <h2 id="sv-h" className="bk__h">Choose a service</h2>
          <div className="bk__svcs" role="radiogroup" aria-label="Service">
            {services.map((x) => (
              <button type="button" key={x.id} role="radio" aria-checked={x.id === serviceId} className="bk__svcopt"
                onClick={() => { setServiceId(x.id); setHours(x.durationMinutes / 60); }}>
                <strong>{x.name}</strong>
                {x.description && <span>{x.description}</span>}
                <span className="num">{priceLabel(x)} · {durationLabel(x.durationMinutes)}</span>
              </button>
            ))}
          </div>
        </section>}

        {step === 0 && <section className="bk__card" aria-labelledby="dt-h">
          <h2 id="dt-h" className="bk__h">Select date and time</h2>
          <p className="bk__sub">Choose a date and time that works for you. Times are shown in Auckland time.</p>
          <div className="bk__days">
            <button type="button" className="bk__arrow" aria-label="Earlier days" disabled={page === 0} onClick={() => setPage(0)}><Icon name="chevronLeft" size={18} /></button>
            <div className="bk__daylist" role="radiogroup" aria-label="Date">
              {visible.map((d) => (
                <button type="button" key={d.key} role="radio" aria-checked={d.key === day} className="bk__day" onClick={() => { setDay(d.key); setHour(null); }}>
                  <span>{d.wd}</span><span>{d.dm}</span>
                </button>
              ))}
            </div>
            <button type="button" className="bk__arrow" aria-label="Later days" disabled={page === 1} onClick={() => setPage(1)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <h3 className="bk__h3">Available times – {picked.long.replace(/ \d{4}$/, "")}</h3>
          <div className="bk__slots" role="radiogroup" aria-label="Start time">
            {SLOTS.map((h) => (
              <button type="button" key={h} role="radio" aria-checked={hour === h} disabled={isPast(day, h)} className="bk__slot" onClick={() => setHour(h)}>{label(h)}</button>
            ))}
          </div>
          <div className="bk__dur">
            <label htmlFor="dur">Duration</label>
            <select id="dur" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[...new Set([0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, hours])].sort((x, y) => x - y).map((h) => <option key={h} value={h}>{fmtHours(h)}</option>)}
            </select>
          </div>
          <div className="bk__actions">
            <a href="/" className="btn btn--secondary bk__back"><Icon name="chevronLeft" size={18} />Back</a>
            <button type="button" className="btn btn--forest bk__go" disabled={hour === null} onClick={() => setStep(1)}>{hour === null ? "Pick a time to continue" : <>Continue <Icon name="chevronRight" size={18} /></>}</button>
          </div>
        </section>}

        {step === 1 && <section className="bk__card" aria-labelledby="ad-h">
          <h2 id="ad-h" className="bk__h">Additional details</h2>
          <p className="bk__sub">Help the provider understand your needs.</p>
          <div className="field">
            <label htmlFor="name" className="field__label">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>
          <div className="field">
            <label htmlFor="description" className="field__label">Describe the job</label>
            <textarea id="description" rows={4} maxLength={2000} required value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What needs doing, and anything the provider should know" />
            <span className="bk__count num">{desc.length}/2000</span>
          </div>
          <div className="bk__actions">
            <button type="button" className="btn btn--secondary bk__back" onClick={() => setStep(0)}><Icon name="chevronLeft" size={18} />Back</button>
            <button type="button" className="btn btn--forest bk__go" disabled={!detailsOk} onClick={() => setStep(2)}>Continue <Icon name="chevronRight" size={18} /></button>
          </div>
        </section>}

        {step === 2 && <section className="bk__card" aria-labelledby="cf-h">
          <h2 id="cf-h" className="bk__h">Confirm your request</h2>
          <p className="bk__sub">Check everything looks right. {provider.name} will accept or decline.</p>
          <dl className="bk__review">
            <div><dt>When</dt><dd>{picked.long}, {hour !== null && end !== null ? `${label(hour)} – ${label(end)}` : ""}</dd></div>
            <div><dt>Name</dt><dd>{name}</dd></div>
            <div><dt>Job</dt><dd>{desc}</dd></div>
          </dl>
          <div className="bk__actions">
            <button type="button" className="btn btn--secondary bk__back" onClick={() => setStep(1)}><Icon name="chevronLeft" size={18} />Back</button>
            <button className="btn btn--forest bk__go">Send request</button>
          </div>
        </section>}
      </div>

      <aside className="bk__side">
        <section className="bk__card" aria-label="Booking summary">
          <h2 className="bk__h">Booking summary</h2>
          <p className="bk__who"><strong>{service?.name ?? provider.category}</strong><span>{provider.name}</span></p>
          <dl className="bk__sum">
            <div><Icon name="calendar" size={22} /><dt>Date</dt><dd>{picked.long}</dd></div>
            <div><Icon name="clock" size={22} /><dt>Time</dt><dd>{hour !== null && end !== null ? `${label(hour)} – ${label(end)} (${fmtHours(hours)})` : "Pick a start time"}</dd></div>
            <div><Icon name="pin" size={22} /><dt>Location</dt><dd>{provider.suburb}, Auckland</dd></div>
            <div><Icon name="tag" size={22} /><dt>Estimated price</dt><dd>{priceType === "quote" ? <strong>Quote on request</strong> : <strong className="num">{dollars(price)}</strong>}<small>{hourly ? `${dollars(unitCents)}/hr × ${fmtHours(hours)}. ` : ""}{priceType === "quote" ? "The provider will quote after your request." : "Final price may vary based on details."}</small></dd></div>
          </dl>
          <p className="bk__note"><Icon name="shield" size={22} /><span><strong>Pay the provider directly</strong>Localo does not collect or hold payment.</span></p>
        </section>
        <section className="bk__card" aria-label="How it works">
          <h2 className="bk__h bk__h--sm">What happens next</h2>
          <ul className="bk__why">
            <li><Icon name="check" size={20} /><span><strong>{provider.name} replies</strong>They accept or decline your request.</span></li>
            <li><Icon name="calendar" size={20} /><span><strong>Cancel any time</strong>Manage it from My bookings.</span></li>
            <li><Icon name="heart" size={20} /><span><strong>Local and trusted</strong>Support people in your community.</span></li>
          </ul>
        </section>
      </aside>
    </form>
  );
}

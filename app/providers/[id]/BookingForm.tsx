"use client";
import { useState } from "react";
import Icon from "../../../components/Icon";
import { dollars, durationLabel, priceLabel } from "../../../components/format";
import { minuteLabel } from "../../../lib/time";

const STEP = 30; // start times every half hour
const pad = (n: number) => String(n).padStart(2, "0");

/** Per day, Auckland minutes: when the provider works, and when they are already taken. */
export type AvailabilityDay = { date: string; windows: [number, number][]; busy: [number, number][] };

export type ServiceOption = { id: string; name: string; description: string; priceType: "fixed" | "hourly" | "quote"; priceCents?: number; durationMinutes: number };

export type SavedAddress = { _id: string; label: string; address: string; suburb: string; accessNotes?: string; isDefault: boolean };

type Props = {
  city: string;
  suburbOptions?: string[];
  /** From account settings. The default one prefills the job location; the phone prefills the contact number. */
  savedAddresses?: SavedAddress[];
  savedPhone?: string;
  availability: AvailabilityDay[];
  services: ServiceOption[];
  initialServiceId?: string;
  action: (fd: FormData) => void | Promise<void>;
  /** Auckland wall time now, "YYYY-MM-DDTHH:mm". Slots before it are disabled. */
  now: string;
  defaultName: string;
  provider: { name: string; category: string; suburb: string; rateCents: number; rateBasis: string; serviceSuburbs?: string[] };
};

/** Day strip + time slots + details. Emits the same `start`/`hours`/`name`/`description` fields the server action reads. */
export default function BookingForm({ action, now, defaultName, provider, services, initialServiceId, availability, savedAddresses = [], savedPhone = "", city, suburbOptions = [] }: Props) {
  const [today, nowTime] = now.split("T");
  const nowMinute = Number(nowTime.slice(0, 2)) * 60 + Number(nowTime.slice(3, 5));
  const days = availability.map((a) => {
    const d = new Date(`${a.date}T00:00:00Z`);
    return { ...a, key: a.date, wd: d.toLocaleDateString("en-NZ", { weekday: "short", timeZone: "UTC" }), dm: d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" }), long: d.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) };
  });
  const [serviceId, setServiceId] = useState(services.find((x) => x.id === initialServiceId)?.id ?? services[0]?.id ?? "");
  const service = services.find((x) => x.id === serviceId);
  const [hours, setHours] = useState(service ? service.durationMinutes / 60 : 2);
  const dur = Math.round(hours * 60);
  /** Start minutes that fit inside working hours, clear of busy time, and not already past. */
  const slotsFor = (date: string) => {
    const d = days.find((x) => x.key === date);
    if (!d) return [];
    const out: number[] = [];
    for (let m = 0; m + dur <= 1440; m += STEP) {
      if (date === today && m <= nowMinute) continue;
      if (d.windows.some(([s, e]) => m >= s && m + dur <= e) && !d.busy.some(([s, e]) => m < e && s < m + dur)) out.push(m);
    }
    return out;
  };
  const [page, setPage] = useState(0);
  const [pickedDay, setDay] = useState<string | null>(null);
  // Until they pick, start on the first day that has a free slot.
  const day = pickedDay ?? days.find((d) => slotsFor(d.key).length > 0)?.key ?? days[0]?.key ?? today;
  const slots = slotsFor(day);
  const [chosen, setHour] = useState<number | null>(null);
  // A time chosen earlier is dropped if a longer duration or another day no longer fits it.
  const startMin = chosen !== null && slots.includes(chosen) ? chosen : null;
  const [desc, setDesc] = useState("");
  const [name, setName] = useState(defaultName);
  const [step, setStep] = useState(0);
  const firstSaved = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
  const [address, setAddress] = useState(firstSaved?.address ?? "");
  const [suburb, setSuburb] = useState(firstSaved?.suburb ?? "");
  const [notes, setNotes] = useState(firstSaved?.accessNotes ?? "");
  const [phone, setPhone] = useState(savedPhone);
  const [savedId, setSavedId] = useState(firstSaved?._id ?? "");
  const [share, setShare] = useState(false);
  const detailsOk = name.trim() !== "" && desc.trim() !== "" && address.trim().length >= 5 && suburb.trim() !== "" && (!share || phone.trim() !== "");
  const area = provider.serviceSuburbs?.length ? [provider.suburb, ...provider.serviceSuburbs] : [];
  const outside = area.length > 0 && suburb.trim() !== "" && !area.some((x) => x.trim().toLowerCase() === suburb.trim().replace(/\s+/g, " ").toLowerCase());

  const picked = days.find((d) => d.key === day) ?? days[0];
  const visible = days.slice(page * 7, page * 7 + 7);
  // With services, price comes from the chosen one; otherwise from the provider's general rate.
  const priceType = service ? service.priceType : provider.rateBasis;
  const unitCents = service ? (service.priceCents ?? 0) : provider.rateCents;
  const hourly = priceType === "hourly";
  const price = hourly ? unitCents * hours : unitCents;
  const end = startMin !== null ? startMin + dur : null;
  const fmtHours = (h: number) => durationLabel(Math.round(h * 60));

  return (
    <form action={action} className="bk__grid" onSubmit={(e) => { if (step < 2) { e.preventDefault(); if (step === 0 ? startMin !== null : detailsOk) setStep(step + 1); } }}>
      <input type="hidden" name="start" value={startMin !== null ? `${day}T${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}` : ""} />
      <input type="hidden" name="hours" value={hours} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={desc} />
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="suburb" value={suburb} />
      <input type="hidden" name="accessNotes" value={notes} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="shareContact" value={share ? "on" : ""} />
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
                <button type="button" key={d.key} role="radio" aria-checked={d.key === day} className="bk__day" disabled={slotsFor(d.key).length === 0} onClick={() => { setDay(d.key); setHour(null); }}>
                  <span>{d.wd}</span><span>{d.dm}</span>
                </button>
              ))}
            </div>
            <button type="button" className="bk__arrow" aria-label="Later days" disabled={page === 1} onClick={() => setPage(1)}><Icon name="chevronRight" size={18} /></button>
          </div>
          <h3 className="bk__h3">Available times – {picked.long.replace(/ \d{4}$/, "")}</h3>
          <div className="bk__slots" role="radiogroup" aria-label="Start time">
            {slots.length === 0 && <p className="bk__sub">No times available on this day{dur > 60 ? " for that duration" : ""}. Try another day.</p>}
            {slots.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={startMin === m} className="bk__slot" onClick={() => setHour(m)}>{minuteLabel(m).toUpperCase()}</button>
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
            <button type="button" className="btn btn--forest bk__go" disabled={startMin === null} onClick={() => setStep(1)}>{startMin === null ? "Pick a time to continue" : <>Continue <Icon name="chevronRight" size={18} /></>}</button>
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
          <h3 className="bk__h3">Where is the job?</h3>
          {suburbOptions.length > 0 && <datalist id="suburb-options">{suburbOptions.map((x) => <option key={x} value={x} />)}</datalist>}
          {savedAddresses.length > 0 && (
            <div className="field"><label htmlFor="saved" className="field__label">Use a saved address</label>
              <select id="saved" value={savedId} onChange={(e) => {
                const a = savedAddresses.find((x) => x._id === e.target.value);
                setSavedId(e.target.value);
                if (a) { setAddress(a.address); setSuburb(a.suburb); setNotes(a.accessNotes ?? ""); }
              }}>
                <option value="">Enter a different address</option>
                {savedAddresses.map((a) => <option key={a._id} value={a._id}>{a.label} · {a.address}, {a.suburb}</option>)}
              </select></div>
          )}
          <div className="field">
            <label htmlFor="address" className="field__label">Street address</label>
            <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" required maxLength={200} placeholder="12 Ponsonby Road" />
          </div>
          <div className="field">
            <label htmlFor="suburb" className="field__label">Suburb</label>
            <input id="suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} autoComplete="address-level2" required maxLength={60} placeholder="Ponsonby" aria-describedby="area-hint" list="suburb-options" />
            <p id="area-hint" className={outside ? "field__hint bk__warn" : "field__hint"}>
              {outside ? `${provider.name} doesn't service ${suburb.trim()}. They cover ${area.join(", ")}.` : area.length ? `${provider.name} covers ${area.join(", ")}.` : "Your full address is only shown to the provider after they accept."}
            </p>
          </div>
          <div className="field">
            <label htmlFor="notes" className="field__label">Access instructions (optional)</label>
            <textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, parking, pets, who to ask for" />
          </div>
          <fieldset className="bk__share">
            <legend className="sr-only">Contact details</legend>
            <label className="bk__check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span><strong>Share my phone and email with {provider.name}</strong>Only after they accept, so you can arrange the visit. Off by default.</span></label>
            <div className="field">
              <label htmlFor="phone" className="field__label">Phone{share ? "" : " (optional)"}</label>
              <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" required={share} placeholder="021 123 4567" />
            </div>
          </fieldset>
          <div className="bk__actions">
            <button type="button" className="btn btn--secondary bk__back" onClick={() => setStep(0)}><Icon name="chevronLeft" size={18} />Back</button>
            <button type="button" className="btn btn--forest bk__go" disabled={!detailsOk} onClick={() => setStep(2)}>Continue <Icon name="chevronRight" size={18} /></button>
          </div>
        </section>}

        {step === 2 && <section className="bk__card" aria-labelledby="cf-h">
          <h2 id="cf-h" className="bk__h">Confirm your request</h2>
          <p className="bk__sub">Check everything looks right. {provider.name} will accept or decline.</p>
          <dl className="bk__review">
            <div><dt>When</dt><dd>{picked.long}, {startMin !== null && end !== null ? `${minuteLabel(startMin)} – ${minuteLabel(end)}` : ""}</dd></div>
            <div><dt>Name</dt><dd>{name}</dd></div>
            <div><dt>Job</dt><dd>{desc}</dd></div>
            <div><dt>Address</dt><dd>{address}, {suburb}</dd></div>
            {notes && <div><dt>Access</dt><dd>{notes}</dd></div>}
            <div><dt>Contact</dt><dd>{share ? `Shared with ${provider.name} after they accept (${phone})` : "Not shared. You can still manage the booking in Localo."}</dd></div>
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
            <div><Icon name="clock" size={22} /><dt>Time</dt><dd>{startMin !== null && end !== null ? `${minuteLabel(startMin)} – ${minuteLabel(end)} (${fmtHours(hours)})` : "Pick a start time"}</dd></div>
            <div><Icon name="pin" size={22} /><dt>Location</dt><dd>{suburb.trim() ? `${suburb.trim()}, ${city}` : "Enter your suburb in Details"}</dd></div>
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

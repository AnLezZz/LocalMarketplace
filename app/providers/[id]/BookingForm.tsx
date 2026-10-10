"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Icon from "../../../components/Icon";
import { dollars, durationLabel, priceLabel } from "../../../components/format";
import { minuteLabel } from "../../../lib/time";
import { modeLabel, type BookingMode, type ServiceMode, type Venue } from "../../../lib/serviceLocation";

const STEP = 30; // start times every half hour
const pad = (n: number) => String(n).padStart(2, "0");
const STEPS = ["Service", "Date & time", "Details", "Review & submit"] as const;
const GENERAL = "__general"; // a provider who has not set up services is booked at their general rate

/** Per day, Auckland minutes: when the provider works, and when they are already taken. */
export type AvailabilityDay = { date: string; windows: [number, number][]; busy: [number, number][] };

export type ServiceOption = {
  id: string; name: string; description: string; priceType: "fixed" | "hourly" | "quote"; priceCents?: number; durationMinutes: number;
  categoryLabel?: string; locationMode?: ServiceMode; venue?: Venue; onlineNote?: string;
};

export type SavedAddress = { _id: string; label: string; address: string; suburb: string; accessNotes?: string; isDefault: boolean };

export type BookResult = { error?: string } | null;

type Props = {
  city: string;
  suburbOptions?: string[];
  /** From account settings. The default one prefills the job location; the phone prefills the contact number. */
  savedAddresses?: SavedAddress[];
  savedPhone?: string;
  availability: AvailabilityDay[];
  services: ServiceOption[];
  initialServiceId?: string;
  /** Returns an error to show (the form keeps everything entered) or redirects to the confirmation. */
  action: (prev: BookResult, fd: FormData) => Promise<BookResult>;
  /** Auckland wall time now, "YYYY-MM-DDTHH:mm". Slots before it are disabled. */
  now: string;
  defaultName: string;
  /** Where Back on the first step goes: the provider's profile. */
  backHref: string;
  provider: { name: string; category: string; suburb: string; rateCents: number; rateBasis: string };
};

/** Sending is one tap: while the request is in flight the button is disabled and says so, so a double tap can't send two. */
function SendButton() {
  const { pending } = useFormStatus();
  return <button className="btn btn--forest bk__go" disabled={pending} aria-busy={pending}>{pending ? "Sending request…" : "Send request"}</button>;
}

/**
 * Service > Date & time > Details > Review & submit. All the entries live in this one component, so going back never loses anything.
 * Where the job happens comes from the service: the customer's address (checked against the service area), the provider's premises
 * (no home address asked for), online (no address), or the customer's choice between the first two.
 */
export default function BookingForm({ action, now, defaultName, backHref, provider, services, initialServiceId, availability, savedAddresses = [], savedPhone = "", city, suburbOptions = [] }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [today, nowTime] = now.split("T");
  const nowMinute = Number(nowTime.slice(0, 2)) * 60 + Number(nowTime.slice(3, 5));
  const days = availability.map((a) => {
    const d = new Date(`${a.date}T00:00:00Z`);
    return { ...a, key: a.date, wd: d.toLocaleDateString("en-NZ", { weekday: "short", timeZone: "UTC" }), dm: d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" }), long: d.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) };
  });

  // ---- 1. service ----
  const [serviceId, setServiceId] = useState(services.length === 0 ? GENERAL : services.find((x) => x.id === initialServiceId)?.id ?? "");
  const service = services.find((x) => x.id === serviceId);
  const [hours, setHours] = useState(service ? service.durationMinutes / 60 : 2);
  const dur = Math.round(hours * 60);
  const priceType = service ? service.priceType : provider.rateBasis;
  const unitCents = service ? (service.priceCents ?? 0) : provider.rateCents;
  const hourly = priceType === "hourly";
  const price = hourly ? unitCents * hours : unitCents;
  const fmtHours = (h: number) => durationLabel(Math.round(h * 60));

  // ---- 2. date and time ----
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
  const day = pickedDay ?? days.find((d) => slotsFor(d.key).length > 0)?.key ?? days[0]?.key ?? today;
  const slots = slotsFor(day);
  const [chosen, setHour] = useState<number | null>(null);
  // A time chosen earlier is dropped if a longer duration or another day no longer fits it.
  const startMin = chosen !== null && slots.includes(chosen) ? chosen : null;
  const picked = days.find((d) => d.key === day) ?? days[0];
  const visible = days.slice(page * 7, page * 7 + 7);
  const end = startMin !== null ? startMin + dur : null;

  // ---- 3. details ----
  const [desc, setDesc] = useState("");
  const [name, setName] = useState(defaultName);
  const firstSaved = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
  const [address, setAddress] = useState(firstSaved?.address ?? "");
  const [suburb, setSuburb] = useState(firstSaved?.suburb ?? "");
  const [notes, setNotes] = useState(firstSaved?.accessNotes ?? "");
  const [savedId, setSavedId] = useState(firstSaved?._id ?? "");
  const [phone, setPhone] = useState(savedPhone);
  const [share, setShare] = useState(false);
  const [choice, setChoice] = useState<BookingMode | "">("");
  const serviceMode: ServiceMode = service?.locationMode ?? "customer";
  const mode: BookingMode | null = serviceMode === "either" ? (choice || null) : serviceMode;
  const venue = service?.venue;
  const problems = {
    name: name.trim() === "" ? "Enter your name" : "",
    description: desc.trim() === "" ? "Describe the job so the provider knows what to expect" : "",
    choice: serviceMode === "either" && !choice ? "Choose where you want this service" : "",
    address: mode === "customer" && address.trim().length < 5 ? "Enter the street address for the job" : "",
    suburb: mode === "customer" && suburb.trim() === "" ? "Enter the suburb" : "",
    phone: share && phone.trim() === "" ? "Add a phone number to share your contact details" : "",
  };
  const detailsOk = Object.values(problems).every((p) => p === "");
  const [showErrors, setShowErrors] = useState(false);
  const err = (k: keyof typeof problems) => (showErrors && problems[k] ? <p className="field__error" role="alert">{problems[k]}</p> : null);

  const [step, setStep] = useState(0);
  // A failed send's message belongs to what was sent; once the customer moves or edits, it is stale.
  const [dismissed, setDismissed] = useState<typeof state>(null);
  const go = (n: number) => { setShowErrors(false); setDismissed(state); setStep(n); };
  const locationText = (() => {
    if (mode === "customer") return address.trim() ? `${address.trim()}, ${suburb.trim()}` : "At your address (enter it in Details)";
    if (mode === "provider") return venue ? `${venue.name}, ${venue.address}, ${venue.suburb}` : "At the provider's premises";
    if (mode === "online") return "Online";
    return service ? modeLabel(serviceMode, venue) : "At your address";
  })();
  const priceLine = priceType === "quote" ? "Quote on request" : dollars(price);
  const priceNote = priceType === "quote" ? "The provider will send you a price. Nothing is booked until you accept it and they accept the booking." : hourly ? `Estimate: ${dollars(unitCents)}/hr × ${fmtHours(hours)}. The final price may vary.` : "Fixed price.";

  const mini = (
    <div className="bk__mini" aria-label="Your selection">
      <strong>{service?.name ?? (services.length === 0 ? provider.category : "Choose a service")}</strong>
      <span>{provider.name}{service || services.length === 0 ? ` · ${fmtHours(hours)} · ${priceType === "quote" ? "Quote on request" : dollars(price)}` : ""}</span>
    </div>
  );

  return (
    <form action={formAction} className="bk__grid" onSubmit={(e) => { if (step < 3) e.preventDefault(); }}>
      <input type="hidden" name="start" value={startMin !== null ? `${day}T${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}` : ""} />
      <input type="hidden" name="hours" value={hours} />
      <input type="hidden" name="serviceId" value={service ? serviceId : ""} />
      <input type="hidden" name="locationChoice" value={serviceMode === "either" ? choice : ""} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={desc} />
      <input type="hidden" name="address" value={mode === "customer" ? address : ""} />
      <input type="hidden" name="suburb" value={mode === "customer" ? suburb : ""} />
      <input type="hidden" name="accessNotes" value={mode === "customer" ? notes : ""} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="shareContact" value={share ? "on" : ""} />
      <ol className="bk__steps" aria-label="Booking steps">
        {STEPS.map((t, i) => (
          <li key={t} aria-current={i === step ? "step" : undefined} data-done={i < step}>
            {i < step ? <button type="button" onClick={() => go(i)}>{i + 1}. {t}</button> : <span>{i + 1}. {t}</span>}
          </li>
        ))}
      </ol>
      <div className="bk__main">
        {mini}

        {step === 0 && <section className="bk__card" aria-labelledby="sv-h">
          <h2 id="sv-h" className="bk__h">Choose a service</h2>
          {services.length === 0 ? (
            <p className="bk__sub">{provider.name} hasn&apos;t listed individual services, so this is a general booking at their rate of <strong>{priceType === "quote" ? "a quote" : `${dollars(unitCents)}${hourly ? "/hr" : ""}`}</strong>. You&apos;ll choose the duration next.</p>
          ) : (
            <div className="bk__svcs" role="radiogroup" aria-label="Service">
              {services.map((x) => (
                <button type="button" key={x.id} role="radio" aria-checked={x.id === serviceId} className="bk__svcopt" onClick={() => { setServiceId(x.id); setHours(x.durationMinutes / 60); setHour(null); setChoice(""); }}>
                  <strong>{x.name}</strong>
                  {x.description && <span>{x.description}</span>}
                  <span className="num">{priceLabel(x)} · {durationLabel(x.durationMinutes)}</span>
                  <span className="bk__svcwhere"><Icon name="pin" size={14} />{modeLabel(x.locationMode, x.venue)}{x.categoryLabel && ` · ${x.categoryLabel}`}</span>
                </button>
              ))}
            </div>
          )}
          <div className="bk__actions">
            <a href={backHref} className="btn btn--secondary bk__back"><Icon name="chevronLeft" size={18} />Back</a>
            <button type="button" className="btn btn--forest bk__go" disabled={!serviceId} onClick={() => go(1)}>{serviceId ? <>Continue <Icon name="chevronRight" size={18} /></> : "Choose a service"}</button>
          </div>
        </section>}

        {step === 1 && <section className="bk__card" aria-labelledby="dt-h">
          <h2 id="dt-h" className="bk__h">Select date and time</h2>
          <p className="bk__sub">Times are shown in Auckland time. A request doesn&apos;t hold the slot until {provider.name} accepts it.</p>
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
            <button type="button" className="btn btn--secondary bk__back" onClick={() => go(0)}><Icon name="chevronLeft" size={18} />Back</button>
            <button type="button" className="btn btn--forest bk__go" disabled={startMin === null} onClick={() => go(2)}>{startMin === null ? "Pick a time to continue" : <>Continue <Icon name="chevronRight" size={18} /></>}</button>
          </div>
        </section>}

        {step === 2 && <section className="bk__card" aria-labelledby="ad-h">
          <h2 id="ad-h" className="bk__h">Your details</h2>
          <p className="bk__sub">Help {provider.name} understand your needs.</p>
          <div className="field">
            <label htmlFor="name" className="field__label">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={showErrors && !!problems.name} />
            {err("name")}
          </div>
          <div className="field">
            <label htmlFor="description" className="field__label">Describe the job</label>
            <textarea id="description" rows={4} maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What you'd like, and anything the provider should know" aria-invalid={showErrors && !!problems.description} />
            <span className="bk__count num">{desc.length}/2000</span>
            {err("description")}
          </div>

          <h3 className="bk__h3">Where does it happen?</h3>
          {serviceMode === "either" && (
            <fieldset className="bk__choice">
              <legend className="sr-only">Where do you want this service?</legend>
              <label className="bk__check"><input type="radio" name="where" checked={choice === "customer"} onChange={() => setChoice("customer")} /><span><strong>At my address</strong>{provider.name} comes to you.</span></label>
              <label className="bk__check"><input type="radio" name="where" checked={choice === "provider"} onChange={() => setChoice("provider")} /><span><strong>At {venue?.name ?? "their premises"}</strong>{venue ? `${venue.address}, ${venue.suburb}` : "You go to them."}</span></label>
              {err("choice")}
            </fieldset>
          )}
          {mode === "provider" && venue && (
            <div className="bk__venue">
              <Icon name="pin" size={22} />
              <div><strong>{venue.name}</strong><span>{venue.address}, {venue.suburb}</span>{venue.notes && <span>{venue.notes}</span>}<small>You go to {provider.name}. No home address is needed.</small></div>
            </div>
          )}
          {mode === "online" && (
            <div className="bk__venue">
              <Icon name="info" size={22} />
              <div><strong>Online</strong><span>{service?.onlineNote || "This service happens online."}</span><small>No address is needed. {provider.name} shares the meeting details once they accept.</small></div>
            </div>
          )}
          {mode === "customer" && (
            <>
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
                <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={200} placeholder="12 Ponsonby Road" aria-invalid={showErrors && !!problems.address} />
                {err("address")}
              </div>
              <div className="field">
                <label htmlFor="suburb" className="field__label">Suburb</label>
                <input id="suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} autoComplete="address-level2" maxLength={60} placeholder="Ponsonby" aria-describedby="area-hint" list="suburb-options" aria-invalid={showErrors && !!problems.suburb} />
                <p id="area-hint" className="field__hint">Your full address is only shown to the provider after they accept. We check they cover this suburb when you send.</p>
                {err("suburb")}
              </div>
              <div className="field">
                <label htmlFor="notes" className="field__label">Access instructions (optional)</label>
                <textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, parking, pets, who to ask for" />
              </div>
            </>
          )}

          <fieldset className="bk__share">
            <legend className="sr-only">Contact details</legend>
            <label className="bk__check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span><strong>Share my phone and email with {provider.name}</strong>Only after they accept, so you can arrange things. Off by default.</span></label>
            <div className="field">
              <label htmlFor="phone" className="field__label">Phone{share ? "" : " (optional)"}</label>
              <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="021 123 4567" aria-invalid={showErrors && !!problems.phone} />
              {err("phone")}
            </div>
          </fieldset>
          <div className="bk__actions">
            <button type="button" className="btn btn--secondary bk__back" onClick={() => go(1)}><Icon name="chevronLeft" size={18} />Back</button>
            <button type="button" className="btn btn--forest bk__go" onClick={() => { if (detailsOk) go(3); else setShowErrors(true); }}>Continue <Icon name="chevronRight" size={18} /></button>
          </div>
          {showErrors && !detailsOk && <p className="field__error" role="alert">Fix the highlighted details to continue.</p>}
        </section>}

        {step === 3 && <section className="bk__card" aria-labelledby="cf-h">
          <h2 id="cf-h" className="bk__h">Review your request</h2>
          <p className="bk__sub">Check everything looks right. This sends a <strong>request</strong>: it isn&apos;t a confirmed booking until {provider.name} accepts it.</p>
          {state?.error && state !== dismissed && (
            <div className="bk__fail" role="alert">
              <strong>We couldn&apos;t send your request</strong>
              <span>{state.error}</span>
              <span className="bk__failact">
                {/available|time/i.test(state.error) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => go(1)}>Pick another time</button>}
                {!/available|time/i.test(state.error) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => go(2)}>Fix my details</button>}
              </span>
            </div>
          )}
          <dl className="bk__review">
            <div><dt>Service</dt><dd>{service?.name ?? provider.category} with {provider.name}</dd></div>
            <div><dt>When</dt><dd>{picked.long}, {startMin !== null && end !== null ? `${minuteLabel(startMin)} – ${minuteLabel(end)} (${fmtHours(hours)})` : ""}</dd></div>
            <div><dt>Where</dt><dd>{locationText}{mode === "provider" && venue?.notes ? ` · ${venue.notes}` : ""}{mode === "online" && service?.onlineNote ? ` · ${service.onlineNote}` : ""}</dd></div>
            <div><dt>Price</dt><dd><strong>{priceLine}</strong><br /><small>{priceNote}</small></dd></div>
            <div><dt>Name</dt><dd>{name}</dd></div>
            <div><dt>Job</dt><dd>{desc}</dd></div>
            {mode === "customer" && notes && <div><dt>Access</dt><dd>{notes}</dd></div>}
            <div><dt>Contact</dt><dd>{share ? `Shared with ${provider.name} after they accept (${phone})` : "Not shared. You can still manage the booking in Localo."}</dd></div>
          </dl>
          <div className="bk__actions">
            <button type="button" className="btn btn--secondary bk__back" onClick={() => go(2)}><Icon name="chevronLeft" size={18} />Back</button>
            <SendButton />
          </div>
        </section>}
      </div>

      <aside className="bk__side">
        <section className="bk__card" aria-label="Booking summary">
          <h2 className="bk__h">Booking summary</h2>
          <p className="bk__who"><strong>{service?.name ?? (services.length === 0 ? provider.category : "No service chosen yet")}</strong><span>{provider.name}</span></p>
          <dl className="bk__sum">
            <div><Icon name="calendar" size={22} /><dt>Date</dt><dd>{picked.long}</dd></div>
            <div><Icon name="clock" size={22} /><dt>Time</dt><dd>{startMin !== null && end !== null ? `${minuteLabel(startMin)} – ${minuteLabel(end)} (${fmtHours(hours)})` : `Pick a start time · ${fmtHours(hours)}`}</dd></div>
            <div><Icon name="pin" size={22} /><dt>Location</dt><dd>{mode === "customer" ? (suburb.trim() ? `${suburb.trim()}, ${city}` : "Enter your suburb in Details") : locationText}</dd></div>
            <div><Icon name="tag" size={22} /><dt>{priceType === "quote" ? "Price" : hourly ? "Estimated price" : "Price"}</dt><dd><strong className={priceType === "quote" ? "" : "num"}>{priceLine}</strong><small>{priceNote}</small></dd></div>
          </dl>
          <p className="bk__note"><Icon name="shield" size={22} /><span><strong>Pay the provider directly</strong>Localo does not collect or hold payment.</span></p>
        </section>
        <section className="bk__card" aria-label="How it works">
          <h2 className="bk__h bk__h--sm">What happens next</h2>
          <ul className="bk__why">
            <li><Icon name="check" size={20} /><span><strong>{provider.name} replies</strong>They accept or decline your request. Until then it isn&apos;t booked.</span></li>
            <li><Icon name="calendar" size={20} /><span><strong>Cancel any time</strong>Manage it from My bookings.</span></li>
            <li><Icon name="heart" size={20} /><span><strong>Local and trusted</strong>Support people in your community.</span></li>
          </ul>
        </section>
      </aside>
    </form>
  );
}

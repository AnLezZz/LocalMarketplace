"use client";
import { useState } from "react";
import { MODE_OPTIONS, type ServiceMode, type Venue } from "../lib/serviceLocation";

/** Where a service happens, with only the fields that mode needs. Plain named fields, read by the server action. */
export default function ServiceLocationFields({ mode: initial, venue, onlineNote, meetingLink }: { mode?: ServiceMode; venue?: Venue; onlineNote?: string; meetingLink?: string }) {
  const [mode, setMode] = useState<ServiceMode>(initial ?? "customer");
  const needsVenue = mode === "provider" || mode === "either";
  return (
    <fieldset className="svc-loc">
      <legend className="field__label">Where does it happen?</legend>
      <div className="svc-loc__modes" role="radiogroup">
        {MODE_OPTIONS.map((o) => (
          <label key={o.value} className="svc-loc__mode">
            <input type="radio" name="locationMode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} />
            <span><strong>{o.label}</strong><small>{o.hint}</small></span>
          </label>
        ))}
      </div>
      {needsVenue && (
        <div className="svc-loc__venue">
          <div className="field"><label htmlFor="venueName" className="field__label">Premises name</label><input id="venueName" name="venueName" defaultValue={venue?.name === "Our premises" ? "" : venue?.name} maxLength={80} placeholder="e.g. Ponsonby Hair Studio" /></div>
          <div className="field"><label htmlFor="venueAddress" className="field__label">Street address</label><input id="venueAddress" name="venueAddress" defaultValue={venue?.address} maxLength={200} required placeholder="14 Ponsonby Road" autoComplete="off" /></div>
          <div className="field"><label htmlFor="venueSuburb" className="field__label">Suburb</label><input id="venueSuburb" name="venueSuburb" defaultValue={venue?.suburb} maxLength={60} required placeholder="Ponsonby" autoComplete="off" /></div>
          <div className="field"><label htmlFor="venueNotes" className="field__label">Arrival notes (optional)</label><input id="venueNotes" name="venueNotes" defaultValue={venue?.notes} maxLength={300} placeholder="Parking, which door, who to ask for" /></div>
          <p className="field__hint">Customers see this address when they choose this service.</p>
        </div>
      )}
      {mode === "online" && (
        <div className="svc-loc__venue">
          <div className="field"><label htmlFor="onlineNote" className="field__label">How it works (shown to customers)</label><input id="onlineNote" name="onlineNote" defaultValue={onlineNote} maxLength={200} placeholder="e.g. Video call, about 45 minutes" /></div>
          <div className="field"><label htmlFor="meetingLink" className="field__label">Meeting link (optional, private)</label><input id="meetingLink" name="meetingLink" type="url" defaultValue={meetingLink} maxLength={300} placeholder="https://" autoComplete="off" /></div>
          <p className="field__hint">The link is never shown on your public page. A customer gets it only after you accept their booking.</p>
        </div>
      )}
    </fieldset>
  );
}

import type { BookingMode, Venue } from "../lib/serviceLocation";

type B = { locationMode?: BookingMode; venue?: Venue; onlineNote?: string; meetingLink?: string; address?: string; suburb?: string; accessNotes?: string };

/**
 * The "where" rows of a booking, from what was copied onto it when it was requested (so later service edits never change them).
 * Customer: their own address, or the venue, or the online details (the private meeting link only appears once the server sends it,
 * which is after acceptance). Provider: the suburb always; the full address and notes once accepted (`open`).
 */
export default function BookingWhere({ b, role, open = true }: { b: B; role: "customer" | "provider"; open?: boolean }) {
  const mode = b.locationMode ?? "customer";
  if (mode === "provider" && b.venue) {
    return (
      <>
        <div><dt>{role === "customer" ? "Where to go" : "Where"}</dt><dd><strong>{b.venue.name}</strong><br />{b.venue.address}, {b.venue.suburb}{b.venue.notes && <><br /><small>{b.venue.notes}</small></>}{role === "provider" && <><br /><small>At your premises. No customer address was collected.</small></>}</dd></div>
      </>
    );
  }
  if (mode === "online") {
    return (
      <>
        <div><dt>Where</dt><dd>Online{b.onlineNote && <><br /><small>{b.onlineNote}</small></>}</dd></div>
        <div>
          <dt>Meeting link</dt>
          <dd>
            {b.meetingLink ? <a href={b.meetingLink} target="_blank" rel="noopener noreferrer">{b.meetingLink}</a>
              : role === "customer" ? <em>Shared by the provider once they accept your booking.</em> : <em>None set. It would be shared with the customer once you accept.</em>}
            {role === "provider" && b.meetingLink && <><br /><small>The customer receives this link only after you accept.</small></>}
          </dd>
        </div>
      </>
    );
  }
  // at the customer's address (and every booking made before locations existed)
  if (role === "customer") {
    return (
      <>
        <div><dt>Address</dt><dd>{b.address ? `${b.address}, ${b.suburb}` : <em>Not recorded (made before addresses were collected)</em>}</dd></div>
        {b.accessNotes && <div><dt>Access instructions</dt><dd>{b.accessNotes}</dd></div>}
      </>
    );
  }
  return (
    <>
      <div><dt>Suburb</dt><dd>{b.suburb ?? "Not recorded"}</dd></div>
      {open && b.address && <div><dt>Address</dt><dd>{b.address}, {b.suburb}</dd></div>}
      {open && b.accessNotes && <div><dt>Access instructions</dt><dd>{b.accessNotes}</dd></div>}
    </>
  );
}

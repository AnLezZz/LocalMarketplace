import "../booking.css";

/** What shows while the booking page and its availability load. */
export default function Loading() {
  return (
    <div className="page page--wide bk" aria-busy="true" aria-live="polite">
      <p className="bk__sub">Loading availability…</p>
      <div className="bk__card" style={{ minHeight: 280 }} />
    </div>
  );
}

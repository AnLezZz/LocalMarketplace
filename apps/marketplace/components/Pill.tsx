import Icon, { type IconName } from "./Icon";

const STATUS: Record<string, { label: string; tone: string; icon: IconName }> = {
  requested: { label: "Requested", tone: "requested", icon: "clock" },
  accepted: { label: "Accepted", tone: "accepted", icon: "check" },
  completed: { label: "Completed", tone: "completed", icon: "check" },
  declined: { label: "Declined", tone: "neutral", icon: "x" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "x" },
};

/** Booking status: tinted pill with a drawn icon, so colour is never the only signal. */
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral", icon: "info" as IconName };
  return (
    <span className={`pill pill--${s.tone}`}>
      <Icon name={s.icon} size={14} />
      {s.label}
    </span>
  );
}

/** Rating with review count, or a "New" pill when there are no reviews yet. */
export function Rating({ avg, count }: { avg: number; count: number }) {
  if (!count) return <span className="pill pill--new">New</span>;
  return (
    <span className="rating">
      <Icon name="star" size={15} className="rating__star" />
      <span className="num">{avg.toFixed(1)}</span>
      <span className="rating__count">({count} {count === 1 ? "review" : "reviews"})</span>
    </span>
  );
}

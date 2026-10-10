import Link from "next/link";
import { isOpen, STATUS_LABEL, STATUS_PILL, type MyRequest } from "../lib/categoryRequests";

/** A provider's requests with where each one stands. `compact` hides the long text, for the application form. */
export default function CategoryRequestList({ requests, compact = false }: { requests: MyRequest[]; compact?: boolean }) {
  if (requests.length === 0) return null;
  return (
    <ul className="svc-list" aria-label="Your category requests">
      {requests.map((r) => (
        <li key={r._id} className="svc-item">
          <div className="svc-item__main">
            <strong>{r.name}</strong>
            {!compact && <span className="svc-item__desc">{r.description}</span>}
            <span className="svc-item__meta">
              {r.suggestedParentLabel ? `Suggested under ${r.suggestedParentLabel}` : "No parent suggested"}
              {r.resolvedCategoryLabel && ` · Listed under ${r.resolvedCategoryLabel}`}
            </span>
            {r.adminNote && !isOpen(r.status) && <span className="svc-item__desc">{r.adminNote}</span>}
          </div>
          <span className={`pill pill--${STATUS_PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          {compact && <Link href="/provider/category-requests" className="btn btn--secondary btn--sm">Track</Link>}
        </li>
      ))}
    </ul>
  );
}

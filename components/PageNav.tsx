import Link from "next/link";

/** Which page numbers to list: the first, the last, and a window around the current one, with gaps shown as an ellipsis. */
function windowOf(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | "gap")[] = [];
  let last = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - last > 1) out.push("gap"); out.push(n); last = n; }
  return out;
}

/** Numbered pagination for a list: Previous, 1 2 3 … 9, Next. Renders nothing for a single page. `hrefFor(1)` should be the plain URL. */
export default function PageNav({ page, pages, hrefFor, label = "Pages" }: { page: number; pages: number; hrefFor: (n: number) => string; label?: string }) {
  if (pages <= 1) return null;
  return (
    <nav className="pnav" aria-label={label}>
      {page > 1 ? <Link href={hrefFor(page - 1)} className="pnav__step" rel="prev">← Previous</Link> : <span className="pnav__step pnav__step--off" aria-hidden="true">← Previous</span>}
      <ol className="pnav__list">
        {windowOf(page, pages).map((n, i) => n === "gap"
          ? <li key={`g${i}`} aria-hidden="true" className="pnav__gap">…</li>
          : <li key={n}>{n === page ? <span className="pnav__num pnav__num--on" aria-current="page"><span className="sr-only">Page </span>{n}</span> : <Link href={hrefFor(n)} className="pnav__num" aria-label={`Page ${n}`}>{n}</Link>}</li>)}
      </ol>
      {page < pages ? <Link href={hrefFor(page + 1)} className="pnav__step" rel="next">Next →</Link> : <span className="pnav__step pnav__step--off" aria-hidden="true">Next →</span>}
    </nav>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "./Icon";
import { categoryImage } from "./categoryImages";

export type CardKid = { slug: string; label: string };

/**
 * One main category on /categories. Desktop: always a card with its type chips. Phone: a row whose chevron opens the chips
 * (the show/hide is CSS keyed on data-open, so the card is the same markup at every width).
 */
export default function CategoryCard({ slug, label, hue, icon, imageUrl, sub, kids, more }: { slug: string; label: string; hue: string; icon: IconName; imageUrl: string | null; sub: string; kids: CardKid[]; more: number }) {
  const [open, setOpen] = useState(false);
  const href = `/categories/${encodeURIComponent(slug)}`;
  const listId = `chips-${slug.replace(/\W+/g, "-")}`;
  return (
    <article className="ccard" data-open={open}>
      <div className="ccard__head">
        <Link href={href} className="ccard__title">
          <span className={`ccard__disc tile--${hue}`}>{categoryImage(slug, imageUrl) ? <img src={categoryImage(slug, imageUrl)!} alt="" /> : <Icon name={icon} size={24} />}</span>
          <span className="ccard__text"><span className="ccard__name">{label}</span><span className="ccard__sub">{sub}</span></span>
        </Link>
        {kids.length > 0 && (
          <button type="button" className="ccard__toggle" aria-expanded={open} aria-controls={listId} aria-label={`${open ? "Hide" : "Show"} ${label} types`} onClick={() => setOpen((o) => !o)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
      </div>
      {kids.length > 0 && (
        <ul className="ccard__chips" id={listId}>
          {kids.map((k) => <li key={k.slug}><Link href={`/categories/${encodeURIComponent(k.slug)}`}>{k.label}</Link></li>)}
          {more > 0 && <li><Link href={href} className="ccard__more">+{more} more</Link></li>}
          <li className="ccard__all"><Link href={href}>All {label} →</Link></li>
        </ul>
      )}
      <Link href={href} className="ccard__go">See providers <span aria-hidden="true">→</span></Link>
    </article>
  );
}

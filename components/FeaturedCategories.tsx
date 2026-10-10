"use client";
import Link from "next/link";
import { usePreloadedQuery, type Preloaded } from "convex/react";
import Icon, { type IconName } from "./Icon";
import type { api } from "../convex/_generated/api";

type Featured = { slug: string; label: string; icon: string; hue: string; imageUrl: string | null };

/**
 * The homepage category row. Server-rendered from a preloaded query, then kept live by Convex: when an admin features,
 * renames, reorders or disables a category, it changes here without a reload. Same markup and styles as before.
 */
export default function FeaturedCategories({ preloaded }: { preloaded: Preloaded<typeof api.categories.featured> }) {
  const cats = usePreloadedQuery(preloaded) as Featured[];
  return (
    <nav className="lp-cats" id="services" aria-label="Categories">
      {cats.map((c) => (
        <Link key={c.slug} href={`/categories/${encodeURIComponent(c.slug)}`} className="lp-cat">
          <span className="lp-cat__icon">{c.imageUrl ? <img src={c.imageUrl} alt="" className="lp-cat__img" /> : <Icon name={c.icon as IconName} size={26} />}</span>
          {c.label}
        </Link>
      ))}
      <Link href="/categories" className="lp-cat lp-cat--all">
        <span className="lp-cat__icon"><Icon name="search" size={26} /></span>
        Browse all categories
      </Link>
    </nav>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { childrenOf, loadCategories, trail } from "../../../lib/categories";
import Icon from "../../../components/Icon";
import ProviderSearch, { type SearchParams } from "../../../components/ProviderSearch";
import { categoryImage } from "../../../components/categoryImages";
import "../categories.css";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const slug = decodeURIComponent((await params).slug);
  const cats = await loadCategories();
  const here = cats.all.find((c) => c.slug === slug && c.active);
  if (!here) notFound();
  const crumbs = trail(cats.all, slug);
  const kids = childrenOf(cats.all, slug);
  return (
    <div className="page page--wide cats">
      <nav aria-label="Breadcrumb">
        <ol className="cats__crumbs">
          <li><Link href="/">Home</Link></li>
          <li><Link href="/categories">Categories</Link></li>
          {crumbs.map((c, i) => <li key={c.slug}>{i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link href={`/categories/${encodeURIComponent(c.slug)}`}>{c.label}</Link>}</li>)}
        </ol>
      </nav>
      <h1 className="cats__title cats__title--page">{here.label}</h1>
      {kids.length > 0 && (
        <>
          <h2 className="cats__eyebrow">Narrow it down</h2>
          <ul className="cats__grid">
            {kids.map((k) => {
              const n = childrenOf(cats.all, k.slug).length;
              return (
                <li key={k.slug}>
                  <Link href={`/categories/${encodeURIComponent(k.slug)}`} className="cats__card">
                    <span className={`cats__thumb tile--${k.hue}`}>{categoryImage(k.slug, k.imageUrl) ? <img src={categoryImage(k.slug, k.imageUrl)!} alt="" /> : <Icon name={k.icon} size={22} />}</span>
                    <span className="cats__name">{k.label}</span>
                    <span className="cats__hint">{n > 0 ? `${n} types` : "All providers"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <ProviderSearch params={await searchParams} basePath={`/categories/${encodeURIComponent(slug)}`} lockedCategory={slug} />
    </div>
  );
}

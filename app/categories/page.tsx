import Link from "next/link";
import { childrenOf, loadCategories } from "../../lib/categories";
import Icon from "../../components/Icon";
import CategoryCard from "../../components/CategoryCard";
import "./categories.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "All categories — Localo" };

const MAX_CHIPS = 4; // a card shows at most 4 chips; a bigger category shows 3 and "+N more", so one busy category never stretches its row

export default async function AllCategories() {
  const cats = await loadCategories();
  const mains = childrenOf(cats.all, null);
  return (
    <div className="page page--wide cats">
      <nav aria-label="Breadcrumb">
        <ol className="cats__crumbs"><li><Link href="/">Home</Link></li><li><span aria-current="page">Categories</span></li></ol>
      </nav>
      <div className="cats__head">
        <div>
          <h1 className="cats__title">All categories</h1>
          <p className="cats__sub">Browse by what you need done. Pick a category to see who offers it near you.</p>
        </div>
        <Link href="/search" className="cats__alt"><Icon name="search" size={18} />Search providers instead</Link>
      </div>
      <div className="ccards">
        {mains.map((m) => {
          const kids = childrenOf(cats.all, m.slug);
          const shown = kids.length > MAX_CHIPS ? kids.slice(0, MAX_CHIPS - 1) : kids;
          return (
            <CategoryCard key={m.slug} slug={m.slug} label={m.label} hue={m.hue} icon={m.icon} imageUrl={m.imageUrl}
              sub={kids.length ? `${kids.length} types` : "All providers"} kids={shown.map((k) => ({ slug: k.slug, label: k.label }))} more={kids.length - shown.length} />
          );
        })}
      </div>
    </div>
  );
}

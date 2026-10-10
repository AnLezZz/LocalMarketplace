import Link from "next/link";
import { childrenOf, loadCategories } from "../../lib/categories";
import Icon from "../../components/Icon";
import "./categories.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "All categories — Localo" };

export default async function AllCategories() {
  const cats = await loadCategories();
  const mains = childrenOf(cats.all, null);
  return (
    <div className="page page--wide">
      <h1 className="cats__title">All categories</h1>
      <p className="cats__sub">Browse by what you need done. Pick a category to see who offers it near you.</p>
      {mains.map((m) => (
        <section key={m.slug} className="cats__group" aria-labelledby={`c-${m.slug}`}>
          <Link href={`/categories/${encodeURIComponent(m.slug)}`} className="cats__card" style={{ gridAutoFlow: "column", justifyContent: "start", alignItems: "center", minHeight: 0 }}>
            <span className="cats__thumb">{m.imageUrl ? <img src={m.imageUrl} alt="" /> : <Icon name={m.icon} size={22} />}</span>
            <h2 id={`c-${m.slug}`} className="cats__name" style={{ margin: 0, fontSize: 18 }}>{m.label}</h2>
          </Link>
          <ul className="cats__kids">
            {childrenOf(cats.all, m.slug).map((s) => <li key={s.slug}><Link href={`/categories/${encodeURIComponent(s.slug)}`}>{s.label}</Link></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import Icon from "../../components/Icon";
import Banner from "../../components/Banner";
import ProviderPhoto from "../../components/ProviderPhoto";
import FavouriteButton from "../../components/FavouriteButton";
import { Rating } from "../../components/Pill";
import { loadCategories, metaIn } from "../../lib/categories";
import type { ProviderSummary } from "../../components/ProviderCard";
import "../search/search.css";
import AccountShell from "../../components/AccountShell";

export const dynamic = "force-dynamic";

export default async function Favourites({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const cats = await loadCategories();
  const list = (await fetchQuery(api.favourites.listMine, {}, await authOpts())) as ProviderSummary[];
  return (
    <AccountShell active="favourites"><div className="acct-pane srch">
      <h1 className="page__title">My favourites</h1>
      <p className="page__sub">Keep track of your trusted providers.</p>
      {err && <Banner tone="error">{err}</Banner>}
      {list.length === 0 ? (
        <div className="empty card">
          <span className="empty__icon"><Icon name="heart" size={26} /></span>
          <h2 className="empty__title">No favourites yet</h2>
          <p className="empty__text">Tap the heart on a provider to save them here.</p>
          <Link href="/search" className="btn btn--forest">Find a pro</Link>
        </div>
      ) : (
        <ul className="srch__list">
          {list.map((p) => (
            <li key={p._id} className="srch__item">
              <ProviderPhoto name={p.name} photo={p.photo} category={p.category} size={96} />
              <div className="srch__info">
                <h2 className="srch__name">{p.name}</h2>
                <div className="srch__meta">{metaIn(cats.all, p.category).label} · {p.suburb}</div>
                <Rating avg={p.ratingAvg} count={p.reviewCount} />
              </div>
              <div className="srch__cta">
                <FavouriteButton providerId={p._id} saved back="/favourites" name={p.name} />
                <Link href={`/providers/${p._id}`} className="btn btn--forest btn--sm">View profile</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div></AccountShell>
  );
}

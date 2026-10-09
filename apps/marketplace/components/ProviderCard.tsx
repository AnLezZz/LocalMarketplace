import Link from "next/link";
import Avatar from "./Avatar";
import { Rating } from "./Pill";
import { categoryMeta } from "./categories";
import { rate } from "./format";

export type ProviderSummary = {
  _id: string; name: string; bio: string; category: string; suburb: string;
  rateCents: number; rateBasis: string; ratingAvg: number; reviewCount: number;
};

/** One provider in a list. The whole card is a single link to the profile. */
export default function ProviderCard({ p, index = 0 }: { p: ProviderSummary; index?: number }) {
  const price = rate(p.rateCents, p.rateBasis);
  return (
    <Link href={`/providers/${p._id}`} className="pcard rise" style={{ "--i": index } as React.CSSProperties}>
      <div className="pcard__top">
        <Avatar name={p.name} />
        <div className="pcard__id">
          <h3 className="pcard__name">{p.name}</h3>
          <div className="pcard__meta">{categoryMeta(p.category).label} · {p.suburb}</div>
        </div>
        <div className="pcard__price">
          <span className="num">{price.amount}</span>
          <span className="pcard__unit">{price.unit.trim()}</span>
        </div>
      </div>
      <p className="pcard__bio">{p.bio}</p>
      <div className="pcard__foot">
        <Rating avg={p.ratingAvg} count={p.reviewCount} />
      </div>
    </Link>
  );
}

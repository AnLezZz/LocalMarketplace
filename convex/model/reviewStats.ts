import type { Doc } from "../_generated/dataModel";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The provider's rating fields after one review is added. */
export function withReview(p: Pick<Doc<"providers">, "ratingAvg" | "reviewCount">, rating: number) {
  const count = p.reviewCount + 1;
  return { reviewCount: count, ratingAvg: round2((p.ratingAvg * p.reviewCount + rating) / count) };
}

/** The provider's rating fields after one review is taken out (hidden). The exact inverse of withReview. */
export function withoutReview(p: Pick<Doc<"providers">, "ratingAvg" | "reviewCount">, rating: number) {
  const count = Math.max(0, p.reviewCount - 1);
  return { reviewCount: count, ratingAvg: count === 0 ? 0 : round2(Math.max(0, (p.ratingAvg * p.reviewCount - rating) / count)) };
}

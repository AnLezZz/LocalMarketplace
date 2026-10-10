import { ConvexError } from "convex/values";

export type PriceType = "fixed" | "hourly" | "quote";
export type PriceSnapshot = { priceType: PriceType; unitCents?: number; estimateCents?: number };

/** Freezes the price for a booking window. Quotes carry no number until the provider offers one. */
export function snapshotPrice(priceType: PriceType, unitCents: number | undefined, startsAt: number, endsAt: number): PriceSnapshot {
  if (priceType === "quote" || unitCents === undefined) return { priceType: "quote" };
  const hours = (endsAt - startsAt) / 3_600_000;
  return { priceType, unitCents, estimateCents: priceType === "hourly" ? Math.round(unitCents * hours) : unitCents };
}

export function validateQuote(amountCents: number, note: string | undefined): { amountCents: number; note?: string } {
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 5_000_000) throw new ConvexError("A quote must be between $1 and $50,000");
  const text = (note ?? "").trim();
  if (text.length > 500) throw new ConvexError("That note is too long");
  return { amountCents, ...(text ? { note: text } : {}) };
}

import type { Doc } from "../_generated/dataModel";

export type Actor = "provider" | "customer";
type Status = Doc<"bookings">["status"];

const RULES: Record<Actor, Partial<Record<Status, Status[]>>> = {
  provider: { requested: ["accepted", "declined", "cancelled"], accepted: ["completed", "cancelled"] },
  customer: { requested: ["cancelled"], accepted: ["cancelled"] },
};

export function canTransition(actor: Actor, from: Status, to: Status): boolean {
  return RULES[actor][from]?.includes(to) ?? false;
}

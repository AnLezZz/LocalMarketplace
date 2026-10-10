// Display wording for where a service happens. The rules themselves live in convex/model/serviceLocation.ts.
export type ServiceMode = "customer" | "provider" | "online" | "either";
export type BookingMode = "customer" | "provider" | "online";
export type Venue = { name: string; address: string; suburb: string; notes?: string };

/** What a provider picks when setting a service up. */
export const MODE_OPTIONS: { value: ServiceMode; label: string; hint: string }[] = [
  { value: "customer", label: "At the customer's address", hint: "You travel to them. Customers give an address, checked against your service area." },
  { value: "provider", label: "At my premises", hint: "Customers come to you. No home address is collected." },
  { value: "either", label: "Either: their address or my premises", hint: "The customer chooses when they book." },
  { value: "online", label: "Online", hint: "No address needed. Your meeting link stays private until you accept." },
];

/** What a customer reads next to a service. */
export function modeLabel(mode: ServiceMode | undefined, venue?: Pick<Venue, "name" | "suburb">): string {
  switch (mode ?? "customer") {
    case "provider": return `At ${venue?.name ?? "the provider's premises"}${venue?.suburb ? `, ${venue.suburb}` : ""}`;
    case "online": return "Online";
    case "either": return `At your address or at ${venue?.name ?? "the provider's premises"}`;
    default: return "At your address";
  }
}

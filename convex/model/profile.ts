import { ConvexError, type Value } from "convex/values";

/**
 * Builds the `users` row created at sign-up. `role` is never read from `params`:
 * those values come straight from the browser, so honouring them would let anyone
 * sign up as an admin. Roles change only through server-side mutations.
 * The sign-in form lower-cases the email too, because sign-in looks the account up
 * by the email exactly as typed.
 */
export function passwordProfile(params: Record<string, Value | undefined>) {
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  if (!email) throw new ConvexError("Email is required");
  const name = typeof params.name === "string" && params.name.trim() ? params.name.trim() : undefined;
  return { email, name, role: "customer" as const };
}

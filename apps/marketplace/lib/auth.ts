import "server-only";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "./convex";

/** Options for fetchQuery/fetchMutation so Convex sees the signed-in user. */
export async function authOpts() {
  return { token: await convexAuthNextjsToken() };
}

export async function getMe(): Promise<{ id: string; name: string | null; email: string | null; role: "customer" | "provider" | "admin" } | null> {
  try {
    return await fetchQuery(api.users.me, {}, await authOpts());
  } catch (e) {
    console.error("getMe failed; treating the visitor as signed out", e);
    return null;
  }
}

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

export function newT() {
  return convexTest(schema, modules);
}
export type T = ReturnType<typeof newT>;
export type Role = "customer" | "provider" | "admin";

export async function createUser(t: T, role: Role, email?: string): Promise<Id<"users">> {
  const address = email ?? `${role}-${crypto.randomUUID()}@test.nz`;
  return await t.run(async (ctx) => ctx.db.insert("users", { email: address, name: role, role }));
}

/** Convex Auth encodes the identity subject as `${userId}|${sessionId}`. */
export function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

export async function createProvider(
  t: T,
  ownerId?: Id<"users">,
  overrides: Record<string, unknown> = {},
): Promise<Id<"providers">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("providers", {
      name: "Test Provider", bio: "Bio", category: "cleaning", suburb: "Ponsonby",
      rateCents: 4500, rateBasis: "hourly", ratingAvg: 0, reviewCount: 0,
      approved: true, ...(ownerId ? { userId: ownerId } : {}), ...overrides,
    } as never),
  );
}

# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sign-in, roles, a provider approval flow and an admin review screen, and close every unauthenticated write path, so the gate "no unauthenticated writes" holds.

**Architecture:** Convex Auth (email + password) owns identity. A `role` field on the auth `users` table (`customer | provider | admin`) is set server-side only. Every public Convex function derives the caller from `getAuthUserId(ctx)`; no function accepts a user or provider id as proof of identity. Ownership is decided by data (`providers.userId`, `bookings.customerId`), not by role labels. The Next.js app passes the Convex Auth token to `fetchQuery`/`fetchMutation` from server components and server actions, and `middleware.ts` redirects signed-out visitors away from private routes.

**Tech Stack:** Convex 1.46 (`@convex-dev/auth` 0.0.96, `Password` provider), Next.js 15 App Router, React 19, pnpm + Turborepo, Vitest + `convex-test` + `@edge-runtime/vm`.

**Spec:** `docs/superpowers/specs/2026-10-09-local-service-marketplace-design.md` (Phase 0 rows of sections 3 and 5)

## Global Constraints

- Roles are exactly `customer`, `provider`, `admin` ("Three roles: customer, provider and admin").
- "Auth is not yet built and `/provider/[id]` is currently unauthenticated; this is the first fix." The `/provider/[id]` route is deleted, not patched.
- Phase 0 gate: "No unauthenticated writes". Every public mutation must refuse a signed-out caller.
- Identity always comes from `ctx.auth` (`getAuthUserId`). Never accept a user id, provider id, role or email as a claim of who the caller is.
- Read `convex/_generated/ai/guidelines.md` before editing anything under `convex/`. Highlights used here: argument validators on every function; `internalMutation`/`internalQuery` for anything not called by the client; index names list every field (`by_userId`); bounded reads (`.take`), except where noted; test files live under `convex/` and use `convex-test` with `import.meta.glob`.
- Dev deployment only. Never run `convex deploy` or any `--prod` command in this plan.
- Locale stays `en-NZ`, times stay `Pacific/Auckland`.
- Out of scope (later phases): payments, reviews, messaging, contact masking, emails, email verification, password reset, editing an approved profile, a second admin app, rate limiting.

## Review Focus

Failure modes the spec implies but a happy-path build would miss, most likely first. Each has a pinned test in the task named in brackets.

1. **Role injection at sign-up.** The Convex Auth docs example copies `role` from the sign-up form into the profile. A visitor posting `role=admin` must still become a `customer`. [Task 1]
2. **Cross-tenant booking changes.** A signed-in user who is not the booking's provider or customer, including another provider, who guesses a booking id must get `not found` and change nothing. [Task 5]
3. **Customer self-approval.** A customer must not be able to accept, decline or complete their own booking; they may only cancel. [Task 5]
4. **Unapproved or rejected providers.** They must be invisible in search, unbookable, able to resubmit (back to pending), and an approved profile must not be silently editable (a category swap would bypass vetting). [Tasks 3, 5]
5. **Admin edge cases and signed-out writes.** Reviewing twice, reviewing an unowned seeded listing, rejecting without a reason, and calling any public mutation signed out must all fail loudly. A source scan fails the build when a new public mutation is added without being covered. [Tasks 4, 5]

Also verified manually in Task 9: the route matcher must not protect `/providers/*` (the public listing) when it protects `/provider`.

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.mts` | Test runner config (edge-runtime) |
| `test-utils/harness.ts` | `newT`, `createUser`, `asUser`, `createProvider` for tests; lives outside `convex/` so Convex never bundles it |
| `convex/schema.ts` | Auth tables, `users.role`, new ownership fields and indexes |
| `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts` | Convex Auth wiring |
| `convex/model/profile.ts` | `passwordProfile`: pure sign-up profile builder (role forced to `customer`) |
| `convex/model/auth.ts` | `getUser`, `requireUser`, `requireRole` |
| `convex/model/categories.ts` | `CATEGORIES` (server-side source of truth) |
| `convex/model/providers.ts` | `providerStatus`, `getProviderForUser`, `validateProfile` |
| `convex/model/bookingRules.ts` | `canTransition(actor, from, to)` pure state machine |
| `convex/users.ts` | `me` query, `grantAdmin` internal mutation |
| `convex/providers.ts` | existing `list`/`get` plus `mine`, `submitProfile` |
| `convex/admin.ts` | `listPending`, `review` |
| `convex/bookings.ts` | rewritten: `create`, `listIncoming`, `listMine`, `transition` |
| `convex/seed.ts` | made internal |
| `convex/security.test.ts` | Public-mutation inventory and signed-out sweep |
| `apps/marketplace/middleware.ts` | Redirect signed-out visitors from private routes |
| `apps/marketplace/lib/auth.ts`, `lib/actions.ts` | `authOpts`, `getMe`, `attempt` |
| `apps/marketplace/app/layout.tsx`, `ConvexClientProvider.tsx`, `SignOutButton.tsx`, `signin/page.tsx` | Auth plumbing and nav |
| `apps/marketplace/app/provider/page.tsx`, `provider/register/page.tsx` | Provider inbox, application status, application form |
| `apps/marketplace/app/providers/[id]/page.tsx` | Booking form requires sign-in |
| `apps/marketplace/app/bookings/page.tsx`, `app/admin/page.tsx` | Customer bookings, admin review queue |

---

### Task 1: Auth foundation and safe sign-up

**Files:**
- Create: `vitest.config.mts`, `test-utils/harness.ts`, `convex/model/profile.ts`, `convex/model/profile.test.ts`, `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`
- Modify: `package.json` (via pnpm), `convex/schema.ts`

**Interfaces:**
- Produces: `passwordProfile(params: Record<string, Value | undefined>): { email: string; name: string | undefined; role: "customer" }`; `roleValidator` exported from `convex/schema.ts`; auth exports `auth, signIn, signOut, store, isAuthenticated` from `convex/auth.ts`; test helpers `newT()`, `T`, `createUser(t, role, email?)`, `asUser(t, userId)`, `createProvider(t, ownerId?, overrides?)`.

- [ ] **Step 1: Confirm the target deployment is dev and holds no real data**

Run: `grep CONVEX_DEPLOYMENT .env.local && npx convex data providers | head -20`
Expected: the deployment name starts with `dev:` and the providers listed are the six seed rows (Sparkle & Shine Cleaning, Green Thumb Gardens, Fixit Fred, Happy Paws Walkers, Mirror Finish Detailing, Two Men & A Ute). If the deployment is not `dev:` or there are other rows, stop and ask.

- [ ] **Step 2: Install dependencies**

```bash
pnpm add -w @convex-dev/auth jose
pnpm add -w -D vitest convex-test @edge-runtime/vm
```

`jose` is required at the repo root because Convex's bundler cannot find it through pnpm's nested layout. Add the script to root `package.json`:

```json
"test": "vitest run"
```

(insert next to `"convex:seed"` in `scripts`).

- [ ] **Step 3: Add the test config and harness**

`vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

`test-utils/harness.ts`:

```ts
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
```

(`createProvider` references `userId` which Task 3 adds to the schema; it type-checks after Task 3. The `as never` keeps Task 1's typecheck green.)

- [ ] **Step 4: Write the failing test for the sign-up profile**

`convex/model/profile.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { passwordProfile } from "./profile";

describe("passwordProfile", () => {
  test("ignores a client-supplied role", () => {
    for (const role of ["admin", "provider", "ADMIN", 1, true]) {
      expect(passwordProfile({ email: "a@b.nz", role: role as never }).role).toBe("customer");
    }
  });

  test("normalises the email and trims the name", () => {
    const p = passwordProfile({ email: "  Kiri@Example.NZ ", name: "  Kiri  " });
    expect(p).toEqual({ email: "kiri@example.nz", name: "Kiri", role: "customer" });
  });

  test("treats a blank name as absent", () => {
    expect(passwordProfile({ email: "a@b.nz", name: "   " }).name).toBeUndefined();
  });

  test("rejects a missing email", () => {
    expect(() => passwordProfile({ password: "x" })).toThrow("Email is required");
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm exec vitest run convex/model/profile.test.ts`
Expected: FAIL, cannot resolve `./profile`.

- [ ] **Step 6: Implement the profile builder**

`convex/model/profile.ts`:

```ts
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
```

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm exec vitest run convex/model/profile.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Wire Convex Auth and extend the schema**

Replace the top of `convex/schema.ts` (imports and the opening of `defineSchema`) so it reads:

```ts
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("customer"), v.literal("provider"), v.literal("admin"));

export default defineSchema({
  ...authTables,
  // Replaces authTables.users to add `role`. The other fields mirror the library's table.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: roleValidator,
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  providers: defineTable({
```

The `providers`, `bookings` and `bookingEvents` tables below stay exactly as they are for now.

`convex/auth.ts`:

```ts
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { passwordProfile } from "./model/profile";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ profile: passwordProfile })],
});
```

`convex/auth.config.ts` (a wrong or missing file silently leaves everyone signed out):

```ts
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```

- [ ] **Step 9: Generate signing keys and set them on the dev deployment**

Keys are generated headlessly (the interactive wizard hangs without a TTY) into a temp dir outside the repo, set with the `NAME=VALUE` form (a value starting with `-----BEGIN` is otherwise parsed as a flag), then deleted:

```bash
KEYS="$(mktemp -d)/auth-keys.json"
node -e 'import("jose").then(async({generateKeyPair,exportPKCS8,exportJWK})=>{const k=await generateKeyPair("RS256",{extractable:true});const priv=await exportPKCS8(k.privateKey);const pub=await exportJWK(k.publicKey);process.stdout.write(JSON.stringify({JWT_PRIVATE_KEY:priv.trimEnd().replace(/\n/g," "),JWKS:JSON.stringify({keys:[{use:"sig",...pub}]})}))})' > "$KEYS"
node -e '
const { execFileSync } = require("node:child_process");
const k = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const vars = { JWT_PRIVATE_KEY: k.JWT_PRIVATE_KEY, JWKS: k.JWKS, SITE_URL: "http://localhost:3000" };
for (const [n, v] of Object.entries(vars)) execFileSync("npx", ["convex", "env", "set", `${n}=${v}`], { stdio: "inherit" });
' "$KEYS"
rm -f "$KEYS"
npx convex env list | cut -d= -f1
```

Expected: the last command prints exactly the variable names `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL` (the `cut` keeps key material out of the terminal).

- [ ] **Step 10: Push and typecheck**

Run: `npx convex dev --once && pnpm exec tsc --noEmit -p convex`
Expected: "Convex functions ready", then no TypeScript errors. This also proves Convex tolerates `*.test.ts` files inside `convex/`. If the push complains about the test file, move `convex/**/*.test.ts` to `convex-tests/` and update `include` in `vitest.config.mts` and the glob path in `test-utils/harness.ts` accordingly, then repeat.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.mts test-utils convex
git commit -m "feat(auth): add Convex Auth with server-assigned customer role

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Identity helpers, current user, admin bootstrap

**Files:**
- Create: `convex/model/auth.ts`, `convex/users.ts`, `convex/users.test.ts`

**Interfaces:**
- Consumes: `roleValidator` and the `users` table (Task 1); `newT`, `createUser`, `asUser` (Task 1).
- Produces:
  - `getUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null>`
  - `requireUser(ctx): Promise<Doc<"users">>` throws `ConvexError("Sign in required")`
  - `requireRole(ctx, role: Doc<"users">["role"]): Promise<Doc<"users">>` throws `ConvexError("Not allowed")`
  - `api.users.me`: `{ id, name: string | null, email: string | null, role } | null`
  - `internal.users.grantAdmin({ email })`: CLI-only

- [ ] **Step 1: Write the failing tests**

`convex/users.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, createUser, newT } from "../test-utils/harness";

describe("users.me", () => {
  test("is null when signed out", async () => {
    const t = newT();
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("returns the caller's role and email", async () => {
    const t = newT();
    const id = await createUser(t, "customer", "kiri@example.nz");
    const me = await asUser(t, id).query(api.users.me, {});
    expect(me).toMatchObject({ id, email: "kiri@example.nz", role: "customer" });
  });
});

describe("users.grantAdmin", () => {
  test("promotes by email, ignoring case", async () => {
    const t = newT();
    const id = await createUser(t, "customer", "boss@example.nz");
    await t.mutation(internal.users.grantAdmin, { email: " Boss@Example.NZ " });
    expect((await t.run((ctx) => ctx.db.get(id)))?.role).toBe("admin");
  });

  test("fails for an unknown email", async () => {
    const t = newT();
    await expect(t.mutation(internal.users.grantAdmin, { email: "nobody@example.nz" })).rejects.toThrow("No user with that email");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run convex/users.test.ts`
Expected: FAIL (no `users` module).

- [ ] **Step 3: Implement**

`convex/model/auth.ts`:

```ts
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;
export type Role = Doc<"users">["role"];

export async function getUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const id = await getAuthUserId(ctx);
  return id ? await ctx.db.get(id) : null;
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getUser(ctx);
  if (!user) throw new ConvexError("Sign in required");
  return user;
}

export async function requireRole(ctx: Ctx, role: Role): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== role) throw new ConvexError("Not allowed");
  return user;
}
```

`convex/users.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUser } from "./model/auth";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return { id: user._id, name: user.name ?? null, email: user.email ?? null, role: user.role };
  },
});

/** Bootstrap an admin from the CLI: npx convex run users:grantAdmin '{"email":"you@example.nz"}' */
export const grantAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!user) throw new ConvexError("No user with that email. They must sign up first.");
    await ctx.db.patch(user._id, { role: "admin" });
    return null;
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run convex/users.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Push, typecheck, commit**

```bash
npx convex dev --once && pnpm exec tsc --noEmit -p convex
git add convex test-utils
git commit -m "feat(auth): add identity helpers, users.me and CLI-only admin grant

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: functions ready, no type errors.

---

### Task 3: Provider ownership and application

**Files:**
- Modify: `convex/schema.ts`, `convex/providers.ts`
- Create: `convex/model/categories.ts`, `convex/model/providers.ts`, `convex/providers.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `getUser` (Task 2); test helpers (Task 1).
- Produces:
  - Schema additions (all optional or additive, so no data migration): `providers.userId?: Id<"users">`, `providers.reviewedAt?: number`, `providers.rejectionReason?: string`, indexes `providers.by_userId`, `providers.by_approved_and_reviewedAt`; `bookings.customerId?: Id<"users">` + index `by_customerId`; `bookingEvents.actorId?: Id<"users">`. Seeded listings keep no owner.
  - `providerStatus(p: Doc<"providers">): "pending" | "approved" | "rejected"` (approved → `approved`; else `reviewedAt` set → `rejected`; else `pending`)
  - `getProviderForUser(ctx, userId): Promise<Doc<"providers"> | null>`
  - `validateProfile(input)`: returns trimmed fields or throws `ConvexError`
  - `api.providers.mine`: provider doc plus `status`, or `null`
  - `api.providers.submitProfile({ name, bio, category, suburb, rateCents, rateBasis }): Id<"providers">`

- [ ] **Step 1: Write the failing tests**

`convex/providers.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createUser, newT } from "../test-utils/harness";

const profile = {
  name: "Kiwi Cleaners", bio: "Weekly cleans.", category: "cleaning",
  suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const,
};

describe("providers.submitProfile", () => {
  test("rejects signed-out callers", async () => {
    const t = newT();
    await expect(t.mutation(api.providers.submitProfile, profile)).rejects.toThrow("Sign in required");
  });

  test("creates a pending profile, makes the user a provider, and hides it from search", async () => {
    const t = newT();
    const userId = await createUser(t, "customer");
    const u = asUser(t, userId);
    await u.mutation(api.providers.submitProfile, profile);
    const mine = await u.query(api.providers.mine, {});
    expect(mine).toMatchObject({ status: "pending", userId, approved: false });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.role).toBe("provider");
    expect(await t.query(api.providers.list, {})).toEqual([]);
  });

  test("one profile per user: resubmitting updates in place", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    const first = await u.mutation(api.providers.submitProfile, profile);
    const second = await u.mutation(api.providers.submitProfile, { ...profile, suburb: "Grey Lynn" });
    expect(second).toBe(first);
    const all = await t.run((ctx) => ctx.db.query("providers").collect());
    expect(all).toHaveLength(1);
    expect(all[0].suburb).toBe("Grey Lynn");
  });

  test("a rejected profile can be resubmitted and returns to pending", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    const id = await u.mutation(api.providers.submitProfile, profile);
    await t.run((ctx) => ctx.db.patch(id, { reviewedAt: 1, rejectionReason: "Photo missing" }));
    expect((await u.query(api.providers.mine, {}))?.status).toBe("rejected");
    await u.mutation(api.providers.submitProfile, profile);
    const again = await u.query(api.providers.mine, {});
    expect(again?.status).toBe("pending");
    expect(again?.rejectionReason).toBeUndefined();
  });

  test("an approved profile cannot be edited (category swap would bypass vetting)", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    const id = await u.mutation(api.providers.submitProfile, profile);
    await t.run((ctx) => ctx.db.patch(id, { approved: true, reviewedAt: 1 }));
    await expect(u.mutation(api.providers.submitProfile, { ...profile, category: "handyman" })).rejects.toThrow("Approved profiles");
  });

  test("validates input", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "customer"));
    await expect(u.mutation(api.providers.submitProfile, { ...profile, category: "wizardry" })).rejects.toThrow("Unknown category");
    await expect(u.mutation(api.providers.submitProfile, { ...profile, rateCents: 12.5 })).rejects.toThrow("Rate");
    await expect(u.mutation(api.providers.submitProfile, { ...profile, rateCents: 0 })).rejects.toThrow("Rate");
    await expect(u.mutation(api.providers.submitProfile, { ...profile, name: "   " })).rejects.toThrow("required");
  });

  test("admins cannot be providers", async () => {
    const t = newT();
    const u = asUser(t, await createUser(t, "admin"));
    await expect(u.mutation(api.providers.submitProfile, profile)).rejects.toThrow("Admins cannot");
  });
});

describe("providers.mine", () => {
  test("is null when signed out or without a profile", async () => {
    const t = newT();
    expect(await t.query(api.providers.mine, {})).toBeNull();
    const u = asUser(t, await createUser(t, "customer"));
    expect(await u.query(api.providers.mine, {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run convex/providers.test.ts`
Expected: FAIL (`submitProfile` does not exist).

- [ ] **Step 3: Extend the schema**

In `convex/schema.ts`, change the three tables to:

```ts
  providers: defineTable({
    name: v.string(),
    bio: v.string(),
    category: v.string(),
    suburb: v.string(),
    rateCents: v.number(),
    rateBasis: v.union(v.literal("hourly"), v.literal("fixed")),
    ratingAvg: v.number(),
    reviewCount: v.number(),
    approved: v.boolean(),
    // Owner. Absent on seeded demo listings, which nobody can manage.
    userId: v.optional(v.id("users")),
    // Set by an admin decision. approved=false with reviewedAt set means rejected.
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_approved", ["approved"])
    .index("by_userId", ["userId"])
    .index("by_approved_and_reviewedAt", ["approved", "reviewedAt"]),

  bookings: defineTable({
    providerId: v.id("providers"),
    // Absent on bookings created before sign-in existed.
    customerId: v.optional(v.id("users")),
    customerName: v.string(),
    customerEmail: v.string(),
    description: v.string(),
    startsAt: v.number(), // UTC ms
    endsAt: v.number(), // UTC ms
    status: v.union(
      v.literal("requested"), v.literal("accepted"), v.literal("declined"),
      v.literal("cancelled"), v.literal("completed"),
    ),
  })
    .index("by_provider", ["providerId"])
    .index("by_customerId", ["customerId"]),

  bookingEvents: defineTable({
    bookingId: v.id("bookings"),
    actorId: v.optional(v.id("users")),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
  }).index("by_booking", ["bookingId"]),
```

- [ ] **Step 4: Add the model helpers**

`convex/model/categories.ts`:

```ts
// Keep in sync with CATEGORIES in apps/marketplace/lib/convex.ts (the app cannot import from convex/).
export const CATEGORIES = ["cleaning", "gardening", "handyman", "pet care", "car detailing", "moving help"] as const;
```

`convex/model/providers.ts`:

```ts
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { CATEGORIES } from "./categories";

export type ProviderStatus = "pending" | "approved" | "rejected";

export function providerStatus(p: Doc<"providers">): ProviderStatus {
  if (p.approved) return "approved";
  return p.reviewedAt !== undefined ? "rejected" : "pending";
}

export async function getProviderForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"providers"> | null> {
  return await ctx.db.query("providers").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
}

export type ProfileInput = {
  name: string; bio: string; category: string; suburb: string;
  rateCents: number; rateBasis: "hourly" | "fixed";
};

export function validateProfile(input: ProfileInput): ProfileInput {
  const name = input.name.trim();
  const bio = input.bio.trim();
  const suburb = input.suburb.trim();
  if (!name || !bio || !suburb) throw new ConvexError("Name, bio and suburb are required");
  if (name.length > 80 || suburb.length > 60 || bio.length > 1000) throw new ConvexError("One of the fields is too long");
  if (!(CATEGORIES as readonly string[]).includes(input.category)) throw new ConvexError("Unknown category");
  if (!Number.isInteger(input.rateCents) || input.rateCents < 100 || input.rateCents > 100_000) {
    throw new ConvexError("Rate must be between $1 and $1,000");
  }
  return { name, bio, category: input.category, suburb, rateCents: input.rateCents, rateBasis: input.rateBasis };
}
```

- [ ] **Step 5: Add the functions**

Replace the whole of `convex/providers.ts` with the following. `list` and `get` keep their behaviour; only the import changes from `queryGeneric` to the generated builder.

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { getProviderForUser, providerStatus, validateProfile } from "./model/providers";

export const list = query({
  args: { category: v.optional(v.string()), suburb: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { category, suburb, q }) => {
    const all = await ctx.db.query("providers").withIndex("by_approved", (i) => i.eq("approved", true)).collect();
    const s = suburb?.toLowerCase(), k = q?.toLowerCase();
    return all.filter((p) =>
      (!category || p.category === category) &&
      (!s || p.suburb.toLowerCase().includes(s)) &&
      (!k || p.name.toLowerCase().includes(k) || p.bio.toLowerCase().includes(k)));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const pid = ctx.db.normalizeId("providers", id);
    const p = pid && (await ctx.db.get(pid));
    return p && p.approved ? p : null;
  },
});

/** The signed-in user's own provider profile, with its review status. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    const p = await getProviderForUser(ctx, user._id);
    return p ? { ...p, status: providerStatus(p) } : null;
  },
});

/** Apply to become a provider, or fix a pending/rejected application. Approved profiles are locked. */
export const submitProfile = mutation({
  args: {
    name: v.string(), bio: v.string(), category: v.string(), suburb: v.string(),
    rateCents: v.number(), rateBasis: v.union(v.literal("hourly"), v.literal("fixed")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") throw new ConvexError("Admins cannot be providers");
    const fields = validateProfile(args);
    const existing = await getProviderForUser(ctx, user._id);
    if (existing?.approved) throw new ConvexError("Approved profiles can't be edited yet. Contact support.");
    if (existing) {
      await ctx.db.patch(existing._id, { ...fields, reviewedAt: undefined, rejectionReason: undefined });
      return existing._id;
    }
    const id = await ctx.db.insert("providers", {
      ...fields, userId: user._id, ratingAvg: 0, reviewCount: 0, approved: false,
    });
    await ctx.db.patch(user._id, { role: "provider" });
    return id;
  },
});
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm exec vitest run convex/providers.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Push, typecheck, commit**

```bash
npx convex dev --once && pnpm exec tsc --noEmit -p convex
git add convex
git commit -m "feat(providers): ownership fields and provider application flow

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: the push validates existing seed rows against the new optional fields (it must succeed with no migration); no type errors.

---

### Task 4: Admin review

**Files:**
- Create: `convex/admin.ts`, `convex/admin.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `providerStatus`, `api.providers.submitProfile/mine/list`, test helpers.
- Produces:
  - `api.admin.listPending()`: `Array<Doc<"providers"> & { ownerEmail: string | null }>`, oldest first, admin only
  - `api.admin.review({ providerId: Id<"providers">, decision: "approve" | "reject", reason?: string }): null`, admin only

- [ ] **Step 1: Write the failing tests**

`convex/admin.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT, type T } from "../test-utils/harness";
import type { Id } from "./_generated/dataModel";

const profile = {
  name: "Kiwi Cleaners", bio: "Weekly cleans.", category: "cleaning",
  suburb: "Ponsonby", rateCents: 4500, rateBasis: "hourly" as const,
};

async function apply(t: T, email = "applicant@example.nz") {
  const userId = await createUser(t, "customer", email);
  const u = asUser(t, userId);
  const providerId: Id<"providers"> = await u.mutation(api.providers.submitProfile, profile);
  return { u, userId, providerId };
}

describe("admin access", () => {
  test("signed-out and non-admin callers are refused", async () => {
    const t = newT();
    const { u, providerId } = await apply(t);
    await expect(t.query(api.admin.listPending, {})).rejects.toThrow("Sign in required");
    await expect(u.query(api.admin.listPending, {})).rejects.toThrow("Not allowed");
    await expect(u.mutation(api.admin.review, { providerId, decision: "approve" })).rejects.toThrow("Not allowed");
  });
});

describe("admin.listPending", () => {
  test("lists only pending applications, with the owner's email", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const pending = await apply(t, "p1@example.nz");
    const rejected = await apply(t, "p2@example.nz");
    await t.run((ctx) => ctx.db.patch(rejected.providerId, { reviewedAt: 1, rejectionReason: "x" }));
    await createProvider(t); // approved, unowned seed-style listing
    const rows = await admin.query(api.admin.listPending, {});
    expect(rows.map((r) => r._id)).toEqual([pending.providerId]);
    expect(rows[0].ownerEmail).toBe("p1@example.nz");
  });
});

describe("admin.review", () => {
  test("approving makes the listing public", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    await admin.mutation(api.admin.review, { providerId, decision: "approve" });
    expect((await u.query(api.providers.mine, {}))?.status).toBe("approved");
    expect((await t.query(api.providers.list, {})).map((p) => p._id)).toEqual([providerId]);
  });

  test("rejecting needs a reason, hides the listing, and keeps the reason", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    await expect(admin.mutation(api.admin.review, { providerId, decision: "reject" })).rejects.toThrow("reason is required");
    await expect(admin.mutation(api.admin.review, { providerId, decision: "reject", reason: "   " })).rejects.toThrow("reason is required");
    await admin.mutation(api.admin.review, { providerId, decision: "reject", reason: "Please add a photo" });
    const mine = await u.query(api.providers.mine, {});
    expect(mine).toMatchObject({ status: "rejected", rejectionReason: "Please add a photo" });
    expect(await t.query(api.providers.list, {})).toEqual([]);
  });

  test("a decision cannot be repeated, and unowned seed listings cannot be reviewed", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { providerId } = await apply(t);
    await admin.mutation(api.admin.review, { providerId, decision: "approve" });
    await expect(admin.mutation(api.admin.review, { providerId, decision: "reject", reason: "oops" })).rejects.toThrow("Already reviewed");
    const seeded = await createProvider(t);
    await expect(admin.mutation(api.admin.review, { providerId: seeded, decision: "reject", reason: "x" })).rejects.toThrow("Already reviewed");
  });

  test("reject, resubmit, approve completes the loop", async () => {
    const t = newT();
    const admin = asUser(t, await createUser(t, "admin"));
    const { u, providerId } = await apply(t);
    await admin.mutation(api.admin.review, { providerId, decision: "reject", reason: "Add a photo" });
    await u.mutation(api.providers.submitProfile, profile);
    expect((await admin.query(api.admin.listPending, {})).map((r) => r._id)).toEqual([providerId]);
    await admin.mutation(api.admin.review, { providerId, decision: "approve" });
    expect((await u.query(api.providers.mine, {}))?.status).toBe("approved");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run convex/admin.test.ts`
Expected: FAIL (no `admin` module).

- [ ] **Step 3: Implement**

`convex/admin.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./model/auth";
import { providerStatus } from "./model/providers";

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const rows = await ctx.db
      .query("providers")
      .withIndex("by_approved_and_reviewedAt", (q) => q.eq("approved", false).eq("reviewedAt", undefined))
      .take(100);
    return await Promise.all(
      rows.map(async (p) => ({ ...p, ownerEmail: p.userId ? ((await ctx.db.get(p.userId))?.email ?? null) : null })),
    );
  },
});

export const review = mutation({
  args: {
    providerId: v.id("providers"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requireRole(ctx, "admin");
    const p = await ctx.db.get(a.providerId);
    if (!p) throw new ConvexError("Provider not found");
    if (providerStatus(p) !== "pending") throw new ConvexError("Already reviewed");
    if (a.decision === "approve") {
      await ctx.db.patch(p._id, { approved: true, reviewedAt: Date.now(), rejectionReason: undefined });
    } else {
      const reason = a.reason?.trim();
      if (!reason) throw new ConvexError("A reason is required to reject");
      await ctx.db.patch(p._id, { reviewedAt: Date.now(), rejectionReason: reason });
    }
    return null;
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run convex/admin.test.ts`
Expected: PASS, 5 tests. If `listPending` returns rejected rows, the `eq("reviewedAt", undefined)` index match is not working as assumed; fall back to `.withIndex("by_approved", ...)` plus `.filter((q) => q.eq(q.field("reviewedAt"), undefined))` and keep `.take(100)`.

- [ ] **Step 5: Push, typecheck, commit**

```bash
npx convex dev --once && pnpm exec tsc --noEmit -p convex
git add convex
git commit -m "feat(admin): provider review queue with approve and reject

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Booking authorization and the no-unauthenticated-writes gate

**Files:**
- Create: `convex/model/bookingRules.ts`, `convex/model/bookingRules.test.ts`, `convex/bookings.test.ts`, `convex/security.test.ts`
- Modify: `convex/bookings.ts` (full rewrite), `convex/seed.ts`

**Interfaces:**
- Consumes: `requireUser`, `getUser`, `getProviderForUser`, test helpers incl. `createProvider`.
- Produces:
  - `type Actor = "provider" | "customer"`; `canTransition(actor, from: BookingStatus, to: BookingStatus): boolean`
  - `api.bookings.create({ providerId: Id<"providers">, customerName, description, startsAt, endsAt }): Id<"bookings">`. Customer id and email come from the session.
  - `api.bookings.listIncoming()`: the caller's provider bookings, newest first (`[]` when signed out or not a provider)
  - `api.bookings.listMine()`: the caller's bookings as a customer, each with `providerName`
  - `api.bookings.transition({ bookingId: Id<"bookings">, to: "accepted" | "declined" | "cancelled" | "completed" })`: `{ ok: true } | { ok: false, reason: string }`
  - `seed:run` becomes an `internalMutation`

- [ ] **Step 1: Write the failing state-machine test**

`convex/model/bookingRules.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { canTransition } from "./bookingRules";

describe("canTransition", () => {
  test("provider may accept, decline or cancel a request, then complete or cancel an accepted job", () => {
    expect(canTransition("provider", "requested", "accepted")).toBe(true);
    expect(canTransition("provider", "requested", "declined")).toBe(true);
    expect(canTransition("provider", "requested", "cancelled")).toBe(true);
    expect(canTransition("provider", "accepted", "completed")).toBe(true);
    expect(canTransition("provider", "accepted", "cancelled")).toBe(true);
  });

  test("customer may only cancel", () => {
    expect(canTransition("customer", "requested", "cancelled")).toBe(true);
    expect(canTransition("customer", "accepted", "cancelled")).toBe(true);
    for (const to of ["accepted", "declined", "completed"] as const) {
      expect(canTransition("customer", "requested", to)).toBe(false);
      expect(canTransition("customer", "accepted", to)).toBe(false);
    }
  });

  test("finished bookings never move", () => {
    for (const from of ["declined", "cancelled", "completed"] as const) {
      for (const actor of ["provider", "customer"] as const) {
        for (const to of ["accepted", "declined", "cancelled", "completed"] as const) {
          expect(canTransition(actor, from, to)).toBe(false);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `pnpm exec vitest run convex/model/bookingRules.test.ts`
Expected: FAIL (module missing).

`convex/model/bookingRules.ts`:

```ts
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
```

Run again. Expected: PASS, 3 tests.

- [ ] **Step 3: Write the failing booking tests**

`convex/bookings.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, createProvider, createUser, newT } from "../test-utils/harness";

const HOUR = 3_600_000;
const soon = () => Date.now() + 24 * HOUR;

async function setup() {
  const t = newT();
  const customerId = await createUser(t, "customer", "cust@example.nz");
  const ownerA = await createUser(t, "provider");
  const ownerB = await createUser(t, "provider");
  const providerA = await createProvider(t, ownerA);
  const providerB = await createProvider(t, ownerB);
  const customer = asUser(t, customerId);
  const request = (providerId = providerA, startsAt = soon()) =>
    customer.mutation(api.bookings.create, { providerId, customerName: "Kiri", description: "Clean the flat", startsAt, endsAt: startsAt + 2 * HOUR });
  return { t, customerId, customer, ownerA, ownerB, providerA, providerB, a: asUser(t, ownerA), b: asUser(t, ownerB), request };
}

describe("bookings.create", () => {
  test("stamps the customer id and email from the session", async () => {
    const { t, customerId, request } = await setup();
    const id = await request();
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ customerId, customerEmail: "cust@example.nz", status: "requested" });
  });

  test("refuses signed-out callers", async () => {
    const { t, providerA } = await setup();
    await expect(
      t.mutation(api.bookings.create, { providerId: providerA, customerName: "x", description: "y", startsAt: soon(), endsAt: soon() + HOUR }),
    ).rejects.toThrow("Sign in required");
  });

  test("refuses providers that are not approved", async () => {
    const { t, customer } = await setup();
    const pending = await createProvider(t, undefined, { approved: false });
    const startsAt = soon();
    await expect(
      customer.mutation(api.bookings.create, { providerId: pending, customerName: "x", description: "y", startsAt, endsAt: startsAt + HOUR }),
    ).rejects.toThrow("provider not found");
  });

  test("refuses booking your own listing", async () => {
    const { a, providerA } = await setup();
    const startsAt = soon();
    await expect(
      a.mutation(api.bookings.create, { providerId: providerA, customerName: "x", description: "y", startsAt, endsAt: startsAt + HOUR }),
    ).rejects.toThrow("can't book yourself");
  });

  test("validates the time window and text", async () => {
    const { customer, providerA } = await setup();
    const base = { providerId: providerA, customerName: "Kiri", description: "d" };
    await expect(customer.mutation(api.bookings.create, { ...base, startsAt: soon(), endsAt: soon() })).rejects.toThrow("invalid time window");
    await expect(customer.mutation(api.bookings.create, { ...base, startsAt: Date.now() - HOUR, endsAt: soon() })).rejects.toThrow("invalid time window");
    await expect(customer.mutation(api.bookings.create, { ...base, description: "  ", startsAt: soon(), endsAt: soon() + HOUR })).rejects.toThrow("missing fields");
  });
});

describe("bookings.listIncoming and listMine", () => {
  test("each provider sees only their own bookings; the customer sees theirs", async () => {
    const { t, customer, a, b, providerB, request } = await setup();
    const forA = await request();
    const forB = await request(providerB);
    expect((await a.query(api.bookings.listIncoming, {})).map((x) => x._id)).toEqual([forA]);
    expect((await b.query(api.bookings.listIncoming, {})).map((x) => x._id)).toEqual([forB]);
    expect((await customer.query(api.bookings.listIncoming, {}))).toEqual([]);
    expect(await t.query(api.bookings.listIncoming, {})).toEqual([]);
    const mine = await customer.query(api.bookings.listMine, {});
    expect(mine.map((x) => x._id).sort()).toEqual([forA, forB].sort());
    expect(mine.every((x) => typeof x.providerName === "string")).toBe(true);
  });
});

describe("bookings.transition", () => {
  test("refuses signed-out callers", async () => {
    const { t, request } = await setup();
    const id = await request();
    await expect(t.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).rejects.toThrow("Sign in required");
  });

  test("another provider and a stranger get 'not found' and change nothing", async () => {
    const { t, b, request } = await setup();
    const stranger = asUser(t, await createUser(t, "customer"));
    const id = await request();
    expect(await b.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toEqual({ ok: false, reason: "not found" });
    expect(await stranger.mutation(api.bookings.transition, { bookingId: id, to: "cancelled" })).toEqual({ ok: false, reason: "not found" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("requested");
  });

  test("the customer cannot accept or complete their own booking, but can cancel", async () => {
    const { t, customer, request } = await setup();
    const id = await request();
    expect(await customer.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toMatchObject({ ok: false });
    expect(await customer.mutation(api.bookings.transition, { bookingId: id, to: "completed" })).toMatchObject({ ok: false });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("requested");
    expect(await customer.mutation(api.bookings.transition, { bookingId: id, to: "cancelled" })).toEqual({ ok: true });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("cancelled");
  });

  test("the provider can accept then complete, and each step records who acted", async () => {
    const { t, ownerA, a, request } = await setup();
    const id = await request();
    expect(await a.mutation(api.bookings.transition, { bookingId: id, to: "accepted" })).toEqual({ ok: true });
    expect(await a.mutation(api.bookings.transition, { bookingId: id, to: "completed" })).toEqual({ ok: true });
    const events = await t.run((ctx) => ctx.db.query("bookingEvents").withIndex("by_booking", (q) => q.eq("bookingId", id)).collect());
    expect(events.map((e) => [e.fromStatus, e.toStatus, e.actorId])).toEqual([
      [undefined, "requested", expect.anything()],
      ["requested", "accepted", ownerA],
      ["accepted", "completed", ownerA],
    ]);
  });

  test("accepting an overlapping booking is refused", async () => {
    const { a, request } = await setup();
    const start = soon();
    const first = await request(undefined, start);
    const second = await request(undefined, start + HOUR);
    expect(await a.mutation(api.bookings.transition, { bookingId: first, to: "accepted" })).toEqual({ ok: true });
    expect(await a.mutation(api.bookings.transition, { bookingId: second, to: "accepted" })).toEqual({
      ok: false, reason: "time conflicts with another accepted booking",
    });
  });
});
```

Note: the `request()` default `providerId = providerA` parameter is evaluated at call time, so `request(undefined, start)` books provider A.

- [ ] **Step 4: Run to verify failure**

Run: `pnpm exec vitest run convex/bookings.test.ts`
Expected: FAIL (old signatures, `listIncoming`/`listMine` missing).

- [ ] **Step 5: Rewrite `convex/bookings.ts`**

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./model/auth";
import { canTransition, type Actor } from "./model/bookingRules";
import { getProviderForUser } from "./model/providers";

export const create = mutation({
  args: {
    providerId: v.id("providers"), customerName: v.string(), description: v.string(),
    startsAt: v.number(), endsAt: v.number(),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    if (!user.email) throw new ConvexError("Your account needs an email address");
    const provider = await ctx.db.get(a.providerId);
    if (!provider?.approved) throw new ConvexError("provider not found");
    if (provider.userId === user._id) throw new ConvexError("You can't book yourself");
    if (!(a.endsAt > a.startsAt) || a.startsAt < Date.now()) throw new ConvexError("invalid time window");
    const customerName = a.customerName.trim();
    const description = a.description.trim();
    if (!customerName || !description) throw new ConvexError("missing fields");
    if (customerName.length > 100 || description.length > 2000) throw new ConvexError("One of the fields is too long");
    const id = await ctx.db.insert("bookings", {
      providerId: provider._id, customerId: user._id, customerName, customerEmail: user.email,
      description, startsAt: a.startsAt, endsAt: a.endsAt, status: "requested",
    });
    await ctx.db.insert("bookingEvents", { bookingId: id, actorId: user._id, toStatus: "requested" });
    return id;
  },
});

/** Requests for the signed-in user's own provider profile. */
export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const provider = await getProviderForUser(ctx, user._id);
    if (!provider) return [];
    return await ctx.db
      .query("bookings")
      .withIndex("by_provider", (i) => i.eq("providerId", provider._id))
      .order("desc")
      .take(200);
  },
});

/** Bookings the signed-in user has requested as a customer. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_customerId", (i) => i.eq("customerId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (b) => ({ ...b, providerName: (await ctx.db.get(b.providerId))?.name ?? "Unknown provider" })),
    );
  },
});

/** Convex mutations are serializable transactions, so the overlap check + write below is atomic. */
export const transition = mutation({
  args: {
    bookingId: v.id("bookings"),
    to: v.union(v.literal("accepted"), v.literal("declined"), v.literal("cancelled"), v.literal("completed")),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(a.bookingId);
    if (!b) return { ok: false as const, reason: "not found" };
    const provider = await ctx.db.get(b.providerId);
    const actor: Actor | null =
      provider?.userId === user._id ? "provider" : b.customerId === user._id ? "customer" : null;
    // Strangers learn nothing about whether the booking exists.
    if (!actor) return { ok: false as const, reason: "not found" };
    if (!canTransition(actor, b.status, a.to)) {
      return { ok: false as const, reason: `cannot go ${b.status} → ${a.to}` };
    }
    if (a.to === "accepted") {
      // Unbounded on purpose: a bounded read could miss a conflict and double-book. Revisit with a
      // by_provider_and_status index in Phase 1.
      const mine = await ctx.db.query("bookings").withIndex("by_provider", (i) => i.eq("providerId", b.providerId)).collect();
      const clash = mine.some((o) => o._id !== b._id && (o.status === "accepted" || o.status === "completed")
        && o.startsAt < b.endsAt && b.startsAt < o.endsAt);
      if (clash) return { ok: false as const, reason: "time conflicts with another accepted booking" };
    }
    await ctx.db.patch(b._id, { status: a.to });
    await ctx.db.insert("bookingEvents", { bookingId: b._id, actorId: user._id, fromStatus: b.status, toStatus: a.to });
    return { ok: true as const };
  },
});
```

- [ ] **Step 6: Make the seed internal**

In `convex/seed.ts` change the first line and the export:

```ts
import { internalMutation } from "./_generated/server";
```

and `export const run = internalMutation({` (replacing `mutationGeneric as mutation` and `mutation({`). `npx convex run seed:run` and `pnpm convex:seed` still work because the CLI runs with admin credentials.

- [ ] **Step 7: Run the booking tests**

Run: `pnpm exec vitest run convex/bookings.test.ts convex/model`
Expected: PASS (11 booking tests plus 7 profile and rules tests).

- [ ] **Step 8: Add the gate test**

`convex/security.test.ts`:

```ts
/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createProvider, createUser, newT } from "../test-utils/harness";

const sources = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// When this fails, a public mutation was added or removed. Add it to the signed-out sweep below.
const PUBLIC_MUTATIONS = ["admin.review", "bookings.create", "bookings.transition", "providers.submitProfile"];

test("the public mutation inventory is explicit", () => {
  const found: string[] = [];
  for (const [path, src] of Object.entries(sources)) {
    if (path.endsWith(".test.ts")) continue;
    const file = path.replace("./", "").replace(".ts", "");
    for (const m of src.matchAll(/export const (\w+) = (?:mutation|mutationGeneric)\(/g)) found.push(`${file}.${m[1]}`);
  }
  expect(found.sort()).toEqual(PUBLIC_MUTATIONS);
});

test("every public mutation refuses a signed-out caller", async () => {
  const t = newT();
  const owner = await createUser(t, "provider");
  const providerId = await createProvider(t, owner);
  const startsAt = Date.now() + 86_400_000;
  const bookingId = await t.run((ctx) =>
    ctx.db.insert("bookings", {
      providerId, customerName: "x", customerEmail: "x@example.nz", description: "x",
      startsAt, endsAt: startsAt + 3_600_000, status: "requested",
    }),
  );
  const calls = [
    () => t.mutation(api.admin.review, { providerId, decision: "approve" }),
    () => t.mutation(api.bookings.create, { providerId, customerName: "A", description: "d", startsAt, endsAt: startsAt + 3_600_000 }),
    () => t.mutation(api.bookings.transition, { bookingId, to: "accepted" }),
    () => t.mutation(api.providers.submitProfile, {
      name: "N", bio: "B", category: "cleaning", suburb: "S", rateCents: 4500, rateBasis: "hourly",
    }),
  ];
  expect(calls).toHaveLength(PUBLIC_MUTATIONS.length);
  for (const call of calls) await expect(call()).rejects.toThrow("Sign in required");
});
```

- [ ] **Step 9: Run the full suite, push, typecheck**

```bash
pnpm test && npx convex dev --once && pnpm exec tsc --noEmit -p convex
```

Expected: all tests pass, functions ready, no type errors. `pnpm convex:seed` should still print `already seeded`.

- [ ] **Step 10: Commit**

```bash
git add convex
git commit -m "feat(bookings): derive caller from session, enforce ownership, make seed internal

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web auth plumbing and sign-in

**Files:**
- Create: `apps/marketplace/middleware.ts`, `lib/auth.ts`, `lib/actions.ts`, `app/ConvexClientProvider.tsx`, `app/SignOutButton.tsx`, `app/signin/page.tsx` (all under `apps/marketplace/`)
- Modify: `apps/marketplace/app/layout.tsx`, `apps/marketplace/package.json` (via pnpm)

**Interfaces:**
- Consumes: `api.users.me` (Task 2).
- Produces: `authOpts(): Promise<{ token: string | undefined }>`, `getMe(): Promise<{ id, name, email, role } | null>`, `attempt<T>(fn): Promise<{ ok: true; value: T } | { ok: false; message: string }>`; routes `/signin`; nav that varies by role.

- [ ] **Step 1: Install**

Run: `pnpm --filter @localhub/marketplace add @convex-dev/auth`

- [ ] **Step 2: Middleware**

`apps/marketplace/middleware.ts`. The patterns are written as exact paths plus `/(.*)`; `/provider(.*)` would also match the public `/providers/...` pages.

```ts
import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
const needsSignIn = createRouteMatcher(["/provider", "/provider/(.*)", "/bookings", "/bookings/(.*)", "/admin", "/admin/(.*)"]);

// Only a convenience redirect. The real enforcement is in the Convex functions.
export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const signedIn = await convexAuth.isAuthenticated();
  if (isSignInPage(request) && signedIn) return nextjsMiddlewareRedirect(request, "/");
  if (needsSignIn(request) && !signedIn) return nextjsMiddlewareRedirect(request, "/signin");
});

export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
```

- [ ] **Step 3: Server helpers**

`apps/marketplace/lib/auth.ts`:

```ts
import "server-only";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "./convex";

/** Options for fetchQuery/fetchMutation so Convex sees the signed-in user. */
export async function authOpts() {
  return { token: await convexAuthNextjsToken() };
}

export async function getMe(): Promise<{ id: string; name: string | null; email: string | null; role: "customer" | "provider" | "admin" } | null> {
  return await fetchQuery(api.users.me, {}, await authOpts());
}
```

`apps/marketplace/lib/actions.ts`:

```ts
import { ConvexError } from "convex/values";

/** Runs a Convex call from a server action and turns failures into a message for the page. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const message = e instanceof ConvexError && typeof e.data === "string" ? e.data : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}
```

- [ ] **Step 4: Client provider, sign-out, layout**

`apps/marketplace/app/ConvexClientProvider.tsx`:

```tsx
"use client";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
```

`apps/marketplace/app/SignOutButton.tsx`:

```tsx
"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button className="alt" onClick={() => void signOut().then(() => { router.push("/"); router.refresh(); })}>
      Sign out
    </button>
  );
}
```

Replace `apps/marketplace/app/layout.tsx`:

```tsx
import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import Link from "next/link";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import SignOutButton from "./SignOutButton";
import { getMe } from "../lib/auth";

export const metadata = { title: "LocalHub", description: "Find trusted local help in Auckland" };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en-NZ">
        <body>
          <ConvexClientProvider>
            <header>
              <Link href="/" className="logo">LocalHub</Link>
              <nav style={{ display: "inline-flex", gap: 16, marginLeft: 16, alignItems: "center" }}>
                {!me && <Link href="/signin">Sign in</Link>}
                {me && me.role !== "admin" && <Link href="/bookings">My bookings</Link>}
                {me?.role === "customer" && <Link href="/provider/register">Become a provider</Link>}
                {me?.role === "provider" && <Link href="/provider">Provider inbox</Link>}
                {me?.role === "admin" && <Link href="/admin">Admin</Link>}
                {me && <SignOutButton />}
              </nav>
            </header>
            <main>{children}</main>
            <footer>LocalHub does not collect, hold or guarantee payment. Pay your provider directly.</footer>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
```

- [ ] **Step 5: Sign-in page**

`apps/marketplace/app/signin/page.tsx`. The form never sends a `role` field; the server would ignore it anyway (Task 1).

```tsx
"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("email", String(fd.get("email") ?? "").trim().toLowerCase());
    fd.set("flow", flow);
    try {
      await signIn("password", fd);
      router.push("/");
      router.refresh();
    } catch {
      setError(flow === "signIn"
        ? "Wrong email or password."
        : "Could not create that account. Try a different email, and use at least 8 characters for your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{flow === "signIn" ? "Sign in" : "Create an account"}</h1>
      {error && <p className="msg" role="alert">{error}</p>}
      <form className="stack" onSubmit={onSubmit}>
        {flow === "signUp" && <input name="name" placeholder="Your name" autoComplete="name" required />}
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input name="password" type="password" placeholder="Password (8+ characters)" autoComplete={flow === "signIn" ? "current-password" : "new-password"} minLength={8} required />
        <button disabled={busy}>{flow === "signIn" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="muted">
        {flow === "signIn" ? "New here? " : "Already have an account? "}
        <a href="#" onClick={(e) => { e.preventDefault(); setError(null); setFlow(flow === "signIn" ? "signUp" : "signIn"); }}>
          {flow === "signIn" ? "Create an account" : "Sign in"}
        </a>
      </p>
    </>
  );
}
```

- [ ] **Step 6: Build and check route protection**

```bash
pnpm --filter @localhub/marketplace exec tsc --noEmit
pnpm --filter @localhub/marketplace dev > "$TMPDIR/next.log" 2>&1 &
sleep 8
for p in /provider /provider/register /bookings /admin; do printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000$p"; done
printf "/signin -> "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/signin
printf "/providers/xyz -> "; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/providers/xyz
printf "/ -> "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
kill %1
```

Expected: the four private paths answer `307` with a redirect to `/signin` (the `/provider/register` and `/provider` pages are added in Task 7, but the middleware redirect fires before the route exists); `/signin` and `/` answer `200`; `/providers/xyz` answers `200` or `404` with **no redirect**, which proves the matcher does not swallow the public listing.

- [ ] **Step 7: Commit**

```bash
git add apps/marketplace package.json pnpm-lock.yaml
git commit -m "feat(web): Convex Auth plumbing, sign-in page, role-aware nav, private-route middleware

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Provider pages and signed-in booking form

**Files:**
- Create: `apps/marketplace/app/provider/register/page.tsx`
- Modify: `apps/marketplace/app/provider/page.tsx` (full rewrite), `apps/marketplace/app/providers/[id]/page.tsx`
- Delete: `apps/marketplace/app/provider/[id]/page.tsx` (the open inbox)

**Interfaces:**
- Consumes: `api.providers.mine/submitProfile`, `api.bookings.listIncoming/transition/create`, `authOpts`, `getMe`, `attempt`.
- Produces: `/provider` (inbox, or application status), `/provider/register` (apply or resubmit), a booking form that requires sign-in.

- [ ] **Step 1: Delete the unauthenticated inbox**

Run: `git rm "apps/marketplace/app/provider/[id]/page.tsx"`

- [ ] **Step 2: Rewrite `apps/marketplace/app/provider/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";

export const dynamic = "force-dynamic";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

export default async function ProviderHome({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const opts = await authOpts();
  const profile = await fetchQuery(api.providers.mine, {}, opts);
  if (!profile) redirect("/provider/register");

  if (profile.status === "pending") {
    return (
      <>
        <h1>Application under review</h1>
        <p className="msg">Thanks, {profile.name}. We check every provider before they appear in search. You will be able to take requests as soon as you are approved.</p>
        <p><Link href="/provider/register">Edit your application</Link></p>
      </>
    );
  }
  if (profile.status === "rejected") {
    return (
      <>
        <h1>Application needs changes</h1>
        <p className="msg">{profile.rejectionReason}</p>
        <p><Link href="/provider/register">Update and resubmit</Link></p>
      </>
    );
  }

  const rows = await fetchQuery(api.bookings.listIncoming, {}, opts);

  async function act(fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), to: String(fd.get("to")) }, await authOpts()));
    revalidatePath("/provider");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/provider?err=${encodeURIComponent(reason)}` : "/provider");
  }

  return (
    <>
      <h1>Requests</h1>
      {err && <p className="msg">{err}</p>}
      {rows.length === 0 && <p className="muted">No requests yet.</p>}
      {rows.map((b: any) => (
        <div className="row" key={b._id}>
          <div>
            <strong>{b.customerName}</strong> · {fmt(b.startsAt)} → {fmt(b.endsAt)}
            <div className="muted">{b.description}</div>
            <div className="muted">Status: {b.status}</div>
          </div>
          <form action={act} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={b._id} />
            {b.status === "requested" && <><button name="to" value="accepted">Accept</button><button className="alt" name="to" value="declined">Decline</button></>}
            {b.status === "accepted" && <><button name="to" value="completed">Mark complete</button><button className="alt" name="to" value="cancelled">Cancel</button></>}
          </form>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Create `apps/marketplace/app/provider/register/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api, CATEGORIES } from "../../../lib/convex";
import { authOpts } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const profile = await fetchQuery(api.providers.mine, {}, await authOpts());
  if (profile?.status === "approved") redirect("/provider");

  async function submit(fd: FormData) {
    "use server";
    const dollars = Number(fd.get("rate"));
    const r = await attempt(async () =>
      fetchMutation(api.providers.submitProfile, {
        name: String(fd.get("name") ?? ""),
        bio: String(fd.get("bio") ?? ""),
        category: String(fd.get("category") ?? ""),
        suburb: String(fd.get("suburb") ?? ""),
        rateCents: Math.round(dollars * 100),
        rateBasis: fd.get("basis") === "fixed" ? "fixed" : "hourly",
      }, await authOpts()));
    redirect(r.ok ? "/provider" : `/provider/register?err=${encodeURIComponent(r.message)}`);
  }

  return (
    <>
      <h1>{profile ? "Update your application" : "Become a provider"}</h1>
      <p className="muted">We review every application before it appears in search.</p>
      {err && <p className="msg" role="alert">{err}</p>}
      <form action={submit} className="stack">
        <input name="name" placeholder="Business or trading name" defaultValue={profile?.name} required maxLength={80} />
        <select name="category" defaultValue={profile?.category ?? ""} aria-label="Category" required>
          <option value="" disabled>Category</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="suburb" placeholder="Suburb" defaultValue={profile?.suburb} required maxLength={60} />
        <label>Rate in NZD
          <input name="rate" type="number" min={1} max={1000} step="0.5" defaultValue={profile ? profile.rateCents / 100 : undefined} required />
        </label>
        <select name="basis" defaultValue={profile?.rateBasis ?? "hourly"} aria-label="Rate basis">
          <option value="hourly">per hour</option>
          <option value="fixed">fixed price</option>
        </select>
        <textarea name="bio" placeholder="Tell customers about your experience" rows={5} defaultValue={profile?.bio} required maxLength={1000} />
        <button>{profile ? "Resubmit" : "Apply"}</button>
      </form>
    </>
  );
}
```

- [ ] **Step 4: Update the booking form in `apps/marketplace/app/providers/[id]/page.tsx`**

Replace the imports with:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../lib/convex";
import { authOpts, getMe } from "../../../lib/auth";
import { attempt } from "../../../lib/actions";
```

Keep `dynamic`, `TZ` and `aucklandToDate` as they are. In the component, after `const p = ...; if (!p) notFound();` add `const me = await getMe();` and replace the `submit` action with:

```tsx
  async function submit(fd: FormData) {
    "use server";
    const startsAt = aucklandToDate(String(fd.get("start")));
    const hours = Math.max(1, Math.min(12, Number(fd.get("hours")) || 1));
    const endsAt = new Date(startsAt.getTime() + hours * 3600_000);
    if (isNaN(startsAt.getTime()) || startsAt < new Date()) redirect(`/providers/${id}?error=Pick+a+future+time`);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (!name || !description) redirect(`/providers/${id}?error=Fill+in+all+fields`);
    const r = await attempt(async () =>
      fetchMutation(api.bookings.create, { providerId: id, customerName: name, description, startsAt: startsAt.getTime(), endsAt: endsAt.getTime() }, await authOpts()));
    redirect(r.ok ? `/providers/${id}?sent=1` : `/providers/${id}?error=${encodeURIComponent(r.message)}`);
  }
```

In the JSX, replace the `<form action={submit} ...>...</form>` block with:

```tsx
      {me ? (
        <form action={submit} className="stack">
          <input name="name" placeholder="Your name" defaultValue={me.name ?? ""} required />
          <label>Start (Auckland time)<input name="start" type="datetime-local" required /></label>
          <label>Hours<input name="hours" type="number" min={1} max={12} defaultValue={2} /></label>
          <textarea name="description" placeholder="Describe the job" rows={4} required />
          <button>Send request</button>
        </form>
      ) : (
        <p className="msg"><Link href="/signin">Sign in</Link> to request a booking.</p>
      )}
```

The email field is gone: the server uses the signed-in account's email.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @localhub/marketplace exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A apps/marketplace
git commit -m "feat(web): provider application, authenticated inbox, signed-in booking form; remove open /provider/[id]

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Customer bookings and admin review pages

**Files:**
- Create: `apps/marketplace/app/bookings/page.tsx`, `apps/marketplace/app/admin/page.tsx`

**Interfaces:**
- Consumes: `api.bookings.listMine/transition`, `api.admin.listPending/review`, `getMe`, `authOpts`, `attempt`.
- Produces: `/bookings` (customer list with cancel), `/admin` (review queue; non-admins get a 404).

- [ ] **Step 1: Create `apps/marketplace/app/bookings/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts } from "../../lib/auth";
import { attempt } from "../../lib/actions";

export const dynamic = "force-dynamic";
const fmt = (ms: number) => new Date(ms).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" });

export default async function MyBookings({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const rows = await fetchQuery(api.bookings.listMine, {}, await authOpts());

  async function cancel(fd: FormData) {
    "use server";
    const r = await attempt(async () =>
      fetchMutation(api.bookings.transition, { bookingId: String(fd.get("id")), to: "cancelled" }, await authOpts()));
    revalidatePath("/bookings");
    const reason = !r.ok ? r.message : r.value.ok ? "" : r.value.reason;
    redirect(reason ? `/bookings?err=${encodeURIComponent(reason)}` : "/bookings");
  }

  return (
    <>
      <h1>My bookings</h1>
      {err && <p className="msg">{err}</p>}
      {rows.length === 0 && <p className="muted">You have not requested anything yet.</p>}
      {rows.map((b: any) => (
        <div className="row" key={b._id}>
          <div>
            <strong>{b.providerName}</strong> · {fmt(b.startsAt)} → {fmt(b.endsAt)}
            <div className="muted">{b.description}</div>
            <div className="muted">Status: {b.status}</div>
          </div>
          {(b.status === "requested" || b.status === "accepted") && (
            <form action={cancel}><input type="hidden" name="id" value={b._id} /><button className="alt">Cancel</button></form>
          )}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Create `apps/marketplace/app/admin/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../lib/convex";
import { authOpts, getMe } from "../../lib/auth";
import { attempt } from "../../lib/actions";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await getMe();
  if (me?.role !== "admin") notFound(); // Convex enforces this too; the 404 just avoids advertising the page.
  const { err } = await searchParams;
  const pending = await fetchQuery(api.admin.listPending, {}, await authOpts());

  async function decide(fd: FormData) {
    "use server";
    const decision = fd.get("decision") === "approve" ? "approve" : "reject";
    const r = await attempt(async () =>
      fetchMutation(api.admin.review, { providerId: String(fd.get("id")), decision, reason: String(fd.get("reason") ?? "") }, await authOpts()));
    revalidatePath("/admin");
    redirect(r.ok ? "/admin" : `/admin?err=${encodeURIComponent(r.message)}`);
  }

  return (
    <>
      <h1>Provider applications</h1>
      {err && <p className="msg" role="alert">{err}</p>}
      {pending.length === 0 && <p className="muted">Nothing waiting for review.</p>}
      {pending.map((p: any) => (
        <div className="row" key={p._id}>
          <div>
            <strong>{p.name}</strong> · {p.category} · {p.suburb}
            <div className="muted">${(p.rateCents / 100).toFixed(2)} {p.rateBasis === "hourly" ? "per hour" : "fixed"} · {p.ownerEmail ?? "no owner"}</div>
            <div>{p.bio}</div>
          </div>
          <form action={decide} style={{ display: "grid", gap: 8 }}>
            <input type="hidden" name="id" value={p._id} />
            <input name="reason" placeholder="Reason (required to reject)" />
            <div style={{ display: "flex", gap: 8 }}>
              <button name="decision" value="approve">Approve</button>
              <button className="alt" name="decision" value="reject">Reject</button>
            </div>
          </form>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm --filter @localhub/marketplace exec tsc --noEmit
git add apps/marketplace
git commit -m "feat(web): customer bookings page and admin review queue

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: no type errors.

---

### Task 9: End-to-end verification and docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Static checks for leftover holes**

```bash
grep -rnE "queryGeneric|mutationGeneric" convex --include=*.ts | grep -v _generated
grep -rnE "providerId: v\.string\(\)|providerId: string" convex apps/marketplace/app --include=*.ts --include=*.tsx
ls "apps/marketplace/app/provider/[id]" 2>&1
pnpm test && pnpm exec tsc --noEmit -p convex && pnpm --filter @localhub/marketplace exec tsc --noEmit
```

Expected: the first three commands print nothing / "No such file or directory"; tests and both typechecks pass.

- [ ] **Step 2: Walk the real flow**

Start both processes (`npx convex dev` in one terminal, `pnpm dev` in another), or use the browser tools. With `pnpm convex:seed` already applied, check each line and note the result:

1. Signed out: `/` lists the six seed providers; a provider page shows "Sign in to request a booking"; `/provider`, `/bookings`, `/admin` redirect to `/signin`.
2. Sign up `owner@example.nz` ("Owner") at `/signin`. Nav shows "Become a provider". Visit `/provider`: redirected to `/provider/register`.
3. Submit an application. `/provider` shows "Application under review". `/` does **not** list it.
4. Sign out, sign up `admin@example.nz`, then run `npx convex run users:grantAdmin '{"email":"admin@example.nz"}'` and refresh. Nav shows "Admin"; `/admin` lists the application with `owner@example.nz`.
5. Reject with no reason: error shown, nothing changes. Reject with "Please add a photo": the owner's `/provider` shows the reason with "Update and resubmit"; resubmit returns it to the admin queue; approve it. It now appears on `/`.
6. Sign up `cust@example.nz`. Request a booking with the new provider; it appears under `/bookings` as `requested`. As the owner, `/provider` shows it; accept it; the customer sees `accepted` and can cancel.
7. Role injection: in the browser console on `/signin`, submit a sign-up with an extra `role=admin` field (for example `fetch` the form with `role` appended, or edit the DOM to add `<input name="role" value="admin">`). After signing in, `/admin` must 404 and the nav must not show "Admin".
8. Tamper: as `cust@example.nz`, try to open `/provider`: redirected to `/provider/register` (no profile), and the nav shows no inbox.

Expected: every line behaves as written. Any deviation is a bug: stop and use superpowers:systematic-debugging.

- [ ] **Step 3: Update `README.md`**

Replace the "Run" section's steps 2 to 5 and the "Notes" section with:

```markdown
## Run
1. `pnpm install`
2. `npx convex dev` (log in once; creates the deployment and writes `.env.local`). Leave it running.
3. Set the auth secrets once per deployment (see "Auth setup" below).
4. `pnpm convex:seed`
5. Put `NEXT_PUBLIC_CONVEX_URL` from `.env.local` into `apps/marketplace/.env.local`, then `pnpm dev`.
6. Open http://localhost:3000 and create an account at `/signin`.

## Auth setup
Convex Auth needs `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` on each deployment (dev and prod). Generate the key pair with `jose` (RS256) and set each with `npx convex env set "NAME=VALUE"`. `SITE_URL` is the app's origin (`http://localhost:3000` in dev).

First admin: sign up, then `npx convex run users:grantAdmin '{"email":"you@example.nz"}'`. There is deliberately no public way to become an admin.

## Roles
- `customer` (default at sign-up) can request and cancel bookings.
- `provider` is assigned when someone applies at `/provider/register`. Providers appear in search only after an admin approves them at `/admin`.
- `admin` is granted only from the CLI.

## Tests
`pnpm test` runs the Convex function tests (Vitest + convex-test). `convex/security.test.ts` fails if a public mutation is added without a signed-out check.

## Deploy
`npx convex deploy`, set the auth variables on the production deployment (with `SITE_URL` set to the production origin), then Vercel: root dir `apps/marketplace`, env `NEXT_PUBLIC_CONVEX_URL` = the production URL.

## Notes
- Overlap protection: the `bookings.transition` mutation checks overlaps inside a Convex transaction, so concurrent accepts cannot double-book.
- Seeded listings have no owner and cannot be managed by anyone; they are demo data.
- Not yet built: payments, emails, email verification, password reset, reviews, messaging.
```

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: document auth setup, roles and tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (Phase 0 row: "Auth and roles, close open provider page, provider approval flow, admin app"; gate "No unauthenticated writes"):**
- Auth and roles: Tasks 1 and 2 (Password provider, server-assigned role, `requireUser`/`requireRole`).
- Close the open provider page: Task 5 removes the id-as-credential arguments; Task 7 deletes `app/provider/[id]`.
- Provider approval flow: Tasks 3 (apply, resubmit) and 4 (review), surfaced in Tasks 7 and 8.
- Admin app: Task 8, as `/admin` routes inside the existing Next app rather than a second app (a deliberate simplification; flagged for the reviewer).
- Gate: `security.test.ts` (Task 5) sweeps every public mutation signed out and fails on any unlisted one; `seed:run` is no longer public.
- Spec trust items that belong to later phases (contact masking, reviews, licence evidence, ID checks beyond the admin's judgement) are deliberately absent.

**Placeholder scan:** no TBD/TODO; every code step has code; every command has an expected result.

**Type and name consistency:** `requireUser`/`requireRole`/`getUser` (model/auth) used in users, providers, admin, bookings; `getProviderForUser`/`providerStatus`/`validateProfile` (model/providers); `canTransition`/`Actor` (model/bookingRules); `listIncoming`/`listMine`/`transition`/`create` match between Task 5 code, Task 5 tests and Tasks 7 and 8 pages; `submitProfile`/`mine` match between Task 3 and Task 7; `listPending`/`review` match between Task 4 and Task 8; `attempt`/`authOpts`/`getMe` defined in Task 6 and used in Tasks 7 and 8; the `to` argument is the four-value union in the mutation and the pages pass plain strings (validated server-side).

**Known limits carried forward:** the overlap check still scans a provider's bookings unbounded (kept for correctness; Phase 1 adds a status index); approved profiles are locked until an edit-and-re-review flow exists; the category list is duplicated between `convex/model/categories.ts` and `apps/marketplace/lib/convex.ts`; no email verification or password reset yet, so a typo'd email at sign-up cannot be recovered.

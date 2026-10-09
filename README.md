# LocalHub (MVP slice)

Turborepo + Next.js + Convex. Spec: local services marketplace PRD v1.1.

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

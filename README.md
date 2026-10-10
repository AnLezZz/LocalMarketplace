# Localo

A local services marketplace: customers find and book providers, providers manage services, availability and bookings, admins moderate. One Next.js app and one Convex backend.

## Project layout
```
app/          Next.js App Router pages (customer, /provider, /admin)
components/   Shared React components
lib/          Server helpers (auth, actions, formatting, time)
public/       Static files (images)
convex/       Backend: schema, queries and mutations, auth, crons, tests
test-utils/   Test harness for the Convex tests
tasks/        Plans, reviews and the pre-deploy checklist
docs/         Specs and plans
```
`PRODUCT.md` describes the product and design context.

## Run
1. `pnpm install`
2. `npx convex dev` (log in once; creates the deployment and writes `.env.local`). Leave it running.
3. Make sure `.env.local` has `NEXT_PUBLIC_CONVEX_URL` (the same value as `CONVEX_URL`). `convex dev` normally adds it for a Next.js project.
4. Set the auth secrets once per deployment (see "Auth setup" below).
5. `pnpm convex:seed`
6. `pnpm dev`, then open http://localhost:3100 (the dev server uses 3100 because port 3000 is occupied by OrbStack on macOS).
7. Pre-seeded test accounts for Admin, Provider, and Customer are documented in [TEST_ACCOUNTS.md](TEST_ACCOUNTS.md).

## Auth setup
Convex Auth needs `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` on each deployment (dev and prod). Generate the key pair with `jose` (RS256) and set each with `npx convex env set "NAME=VALUE"`. `SITE_URL` is the app's origin (`http://localhost:3000` in dev).

First admin: sign up, then `npx convex run users:grantAdmin '{"email":"you@example.nz"}'`. On the production deployment add `--prod` (`npx convex run --prod users:grantAdmin ...`), and only after you have signed in successfully with that email on production. Unless `REQUIRE_EMAIL_VERIFICATION` is on, emails are not verified, so granting admin to an address someone else may have registered first would promote the wrong person. There is deliberately no public way to become an admin.

## Password reset and email verification
Both use one-time 8 digit codes (valid 20 minutes) sent through Resend, so they need the Email setup below.
- **Password reset** turns on as soon as email can be sent. `/signin` then shows "Forgot your password?", which goes to `/signin/reset`. The page gives the same answer for unknown addresses. Resetting cancels the account's other sessions; an access token already issued stays valid until it expires (up to an hour).
- **Email verification** is a separate switch, because it makes every account without a verified email enter a code at its next sign-in: `npx convex env set REQUIRE_EMAIL_VERIFICATION true`. On a deployment that already has users, run `npx convex run users:markExistingVerified` first (only if you trust the existing emails), or they will all be asked for a code.
- **Development without Resend:** `npx convex env set AUTH_LOG_CODES true` logs the codes in the Convex logs instead of emailing them. Never set it on production.

## Email (Resend)
Booking and review notifications are also emailed, and a reminder goes to both sides once an accepted booking is within 24 hours (an hourly cron, `convex/crons.ts`). Emails are sent from Convex with Resend. Without a key the app still works: emails are skipped and logged.

```
npx convex env set RESEND_API_KEY re_xxxxxxxx
npx convex env set EMAIL_FROM "Localo <bookings@your-verified-domain>"   # optional in dev
```
`SITE_URL` (already set for auth) is used for the links in the emails. Until you verify a domain in Resend, the default sender (`onboarding@resend.dev`) only delivers to the email address of your own Resend account, so test by signing up with that address. Add `--prod` for the production deployment. A failed send is logged and never blocks or retries the booking action.

## Roles
- `customer` (default at sign-up) can request and cancel bookings.
- `provider` is assigned when someone applies at `/provider/register`. Providers appear in search only after an admin approves them at `/admin`.
- `admin` is granted only from the CLI.

## Tests
`pnpm typecheck` checks the app and `convex/`. `pnpm test` runs the Convex function tests (Vitest + convex-test). `convex/security.test.ts` fails if a public mutation is added without a signed-out check.

`convex/_generated` is gitignored, so a fresh clone needs `npx convex codegen` (or `npx convex dev --once`) before `pnpm test`.

## Deploy
Do not run the seed (`pnpm convex:seed`) on a production deployment: seeded listings have no owner, are demo-only, and cannot answer bookings.

`npx convex deploy`, set the auth variables on the production deployment (with `SITE_URL` set to the production origin), then Vercel: import the repository with the default settings (the app is at the repository root), env `NEXT_PUBLIC_CONVEX_URL` = the production URL.

## Notes
- Overlap protection: the `bookings.transition` mutation checks overlaps inside a Convex transaction, so concurrent accepts cannot double-book.
- Seeded listings have no owner and cannot be managed by anyone; they are demo data and should not be seeded in production.
- Not yet built: payments, emails, email verification, password reset, reviews, messaging.

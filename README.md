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
`PRODUCT.md` describes the product, what is built and what is not, and the design context.

## What it does
- **Customers** browse the category tree or search by keyword, price, rating and New Zealand place; pick a service; choose a time from the provider's real availability (Pacific/Auckland); and send a request through a four-step booking flow. They can answer the provider's booking questions, reuse saved addresses and choose whether to share contact details. A request is not a booking until the provider accepts. They then manage bookings (cancel, request another time, answer quotes, report a problem), review completed jobs, keep favourites and get live and email notifications, all from one account area.
- **Services** are fixed, hourly or quote priced, belong to a category, and happen at the customer's address, the provider's premises, online or either of the first two. Location, price and answers are copied onto the booking when it is requested, so later edits never rewrite history.
- **Providers** apply, get approved, and manage profile, gallery, services, service areas, working hours, time off and bookings from a dashboard that updates live. They accept, decline, quote, complete, cancel and propose new times.
- **Admins** approve providers, suspend accounts, moderate reviews, resolve disputes, manage categories and read the audit log.
- Payments are not part of the platform: customers pay providers directly.

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
Booking and review notifications are also emailed, and a reminder goes to both sides once an accepted booking is within 24 hours (an hourly cron, `convex/crons.ts`). The same file has a daily job that deletes notifications older than 60 days. Emails are sent from Convex with Resend. Without a key the app still works: emails are skipped and logged. Real delivery through Resend has not been verified yet.

```
npx convex env set RESEND_API_KEY re_xxxxxxxx
npx convex env set EMAIL_FROM "Localo <bookings@your-verified-domain>"   # optional in dev
```
`SITE_URL` (already set for auth) is used for the links in the emails. Until you verify a domain in Resend, the default sender (`onboarding@resend.dev`) only delivers to the email address of your own Resend account, so test by signing up with that address. Add `--prod` for the production deployment. A failed send is logged and never blocks or retries the booking action.

## Category requests
A provider whose service is not in the category list uses **Can't find your category?** on the apply form, or `/provider/category-requests` any time. They name the service, describe it and may suggest a parent, then carry on with their profile. Admins decide at **Admin → Category requests**: create the category, map it to an existing one, ask a question, or reject. Each request is `pending`, `approved`, `assigned` (to an existing category), `more_info` or `rejected`, and the provider is notified of every decision.

- Names are checked against every existing category (same name or key ignoring case and punctuation is refused; similar names are flagged for the admin).
- A service can be saved as a draft that waits on a request. Approving or assigning gives it the category but never turns it on; the provider does that, and a listing is only public for an approved provider.
- Providers only ever read and answer their own requests; deciding and the queue are admin-only (`convex/categoryRequests.ts`).
- Deploy the backend (`npx convex deploy`) before the frontend: this adds a table, a services field and new functions.

## Roles
- `customer` (default at sign-up) can request, reschedule, cancel and review bookings, and keep favourites.
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
- Place data (regions, districts, suburbs) comes from imported open data, not hand-entered lists; see `scripts/geo-import.mts` and `convex/geoImport.ts`. Search and provider service areas use it, and Convex enforces service-area coverage when a booking is requested.
- Dashboards and account pages update live: a small reactive fingerprint of the user's bookings makes the page re-fetch in place.
- Not yet built: payments, in-app messaging, job posting with competing quotes, recurring bookings, structured provider verification, street-address autocomplete, changing email or password while signed in, quote expiry, business reporting. The roadmap is in `docs/` and `tasks/todo.md`.

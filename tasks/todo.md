# Phase 0: Foundation

Full plan with code, commands and expected output: `docs/superpowers/plans/2026-10-09-phase-0-foundation.md`
Spec: `docs/superpowers/specs/2026-10-09-local-service-marketplace-design.md`
Gate: no unauthenticated writes.

- [x] Task 1: Auth foundation and safe sign-up (Convex Auth, server-assigned role, test harness)
- [x] Task 2: Identity helpers, `users.me`, CLI-only admin grant
- [x] Task 3: Provider ownership fields and application flow
- [x] Task 4: Admin review (approve / reject with reason)
- [x] Task 5: Booking authorization, public-mutation inventory test, internal seed
- [x] Task 6: Web auth plumbing, sign-in page, role-aware nav, middleware
- [x] Task 7: Provider inbox/application pages, signed-in booking form, delete `/provider/[id]`
- [x] Task 8: Customer bookings page and `/admin` queue
- [x] Task 9: End-to-end verification and README

## Review
Executed 2026-10-09 via subagent-driven development (12 implementation commits 3180826..4281833, then a final fix wave to 5af70bb). 44/44 tests, both typechecks clean.

Verified: Convex-level tests (mocked identities) and a scripted real-auth walkthrough against the DEV deployment (32/32, including role=admin injected at every sign-up -> all customers). The "no unauthenticated writes" gate is enforced by convex/security.test.ts.

NOT verified: the browser half (cookies, Next /api/auth proxy, server actions with a live session, middleware with a session, page rendering). Run walkthrough steps 2-8 in a browser on port 3100 before merging (port 3000 is held by OrbStack on this machine).

Left in the DEV deployment (not deleted): 4 users e2e-{owner,admin,cust,inject}@example.nz, provider "E2E Test Provider (delete me)", one cancelled booking with its events.

Deferred (see final review triage): auth.ts wrapper untested; account-linking latent risk if `verify`/OAuth is ever added; public provider queries expose userId; `?err=` text reflection; signed-in labels/a11y; list queries truncate silently; overlap check reads all of a provider's bookings (add by_provider_and_status index in Phase 1); jose is a dependency but only needed as a devDependency; email verification, rate limiting and contact masking are out of scope.

---

# Phase 1: Complete the dashboards (audit + plan, awaiting go-ahead)

Spec: the "Locallo — Complete Missing Dashboard Features" brief (pasted 2026-10-09) + the 15-screen mockup set.
Rule: nothing below is marked done until it works in a browser and has a Convex test.

## Audit (what exists vs the brief)

Brief assumptions that do NOT match the repo: no Tailwind / shadcn (plain CSS, `app/*.css`), no email integration, no file/image upload, routes are `/bookings`, `/provider`, `/admin` (not `/dashboard`, `/provider/dashboard`, `/admin/dashboard`), name is Localo (renamed this session). Keeping existing routes and plain CSS is the minimal-impact path.

Feature | Existing | Missing | Priority | Action
--- | --- | --- | --- | ---
Auth / roles / server-side checks | Convex Auth, `role` on users, requireUser/requireRole, security.test.ts inventory | Suspended accounts, role switcher (a user is one role today), dual customer+provider | P1 | Add `suspended` flag; "provider mode" = has a provider profile, not a second role
Provider booking mgmt | accept/decline/complete (fixed this session), overlap check, bookingEvents | provider-initiated cancel, reschedule request, details view, history tab, atomic by-status index | P1 | Extend `bookings.transition`; add `rescheduleRequests`
Availability calendar | WeeklyCalendar UI over bookings only | working hours, breaks, exceptions, blocked slots, month/day views, customer-side availability | P1 | New `availability` tables + queries; booking page reads them
Service management | one rate per provider (`rateCents`) | `services` table, CRUD, archive, duration, quote-required, images | P1 | New `services`; booking page picks a service
Customer dashboard | `/bookings` with tabs, cancel | overview, booking detail page, reschedule request, favourites, reviews, profile/addresses/notification prefs | P2 | `favourites`, `reviews`, profile fields
Reviews | `ratingAvg`/`reviewCount` fields only (seed placeholders, no review rows) | `reviews` table, eligibility (completed + one per booking), report/moderation | P2 | New table + mutations; recompute aggregates
Notifications | none | `notifications` table, bell + centre, realtime | P2 | New table, written from booking/review mutations; email skipped (no integration)
Admin provider mgmt | approve/reject queue | suspend/reactivate, search/filter, status enum (pending/approved/rejected/suspended) | P1 | Replace `approved`+`reviewedAt` inference with a `status` field via migration
Admin customers / bookings | recent-bookings list, stats | customer list/search/suspend, booking search + filters + detail | P2 | New queries + pages
Categories / locations | hard-coded `CATEGORIES` | admin-managed categories, cities, suburbs | P3 | `categories`, `locations` tables; seed from current constants
Review moderation / audit log | none | hide/restore with reason, `auditLog` table | P3 | `auditLog` written by every admin/status mutation
Realtime | pages are server-rendered (`force-dynamic`), no live updates | Convex `useQuery` in client components | P2 | Move dashboards to reactive queries per slice
Tenant isolation | per-mutation owner checks, tested for bookings/providers | same for every new table | P1 | Test-first per slice
Dead/decorative UI | removed dead sidebar links this session | sidebar items for new pages | — | Add items only when the page exists

## Plan (vertical slices, each ends with browser + convex-test verification)

- [x] S1 Provider bookings: provider cancel, details, history, exact overlap index (notifications table deferred to S6)
- [x] S2 Services: `services` CRUD + booking page uses real services (images deferred: needs file storage)
- [ ] S3 Availability: weekly hours, exceptions, blocks, customer-facing slot filtering, day/week/month views
- [ ] S4 Customer: favourites, booking detail, reschedule request, profile
- [ ] S5 Reviews: eligibility, duplicate guard, aggregates, report
- [ ] S6 Notifications: bell, centre, realtime
- [ ] S7 Admin: provider status enum + suspend, customers, bookings, moderation, audit log
- [ ] S8 Categories + locations
- [ ] Polish: reactive queries, skeletons, responsive pass

Phase 2 (job posting / proposals): schema left untouched; keep `bookings` creatable from a future `proposals` table.

## Open decisions
1. Keep plain CSS + current routes (recommended) vs adopt Tailwind/shadcn + the brief's routes.
2. Slice order / how many slices per session.
3. Image upload via Convex file storage (needed for profile photo, service images, gallery).

## S1 review (2026-10-09)
Done: index `by_provider_and_status_and_endsAt` + exact overlap check; `bookings.getForProvider` (owner only, no customer email); provider dashboard Pending/Upcoming/History/All tabs, Cancel on accepted rows, `/provider/bookings/[id]` details + history timeline; shared `transitionBooking` server action.
Verified: 48 convex tests (new: cancel frees slot, back-to-back ok, per-provider, getForProvider isolation); browser run as customer + provider (request -> details -> accept -> cancel -> history), signed-out redirected, customer gets 404. Schema pushed to the dev deployment.
Not done: reschedule requests, provider notifications (S6), by-status tab counts are computed client-side from the first 200 rows.

## S2 review (2026-10-09)
Done: `services` table (+ `serviceId`/`serviceName` on bookings); `services.{listMine,listForProvider,create,update,setEnabled,archive}`; `/provider/services` (list, add, edit, enable/disable, archive); profile page lists real services (falls back to the general rate when none); booking page has a service picker, per-service price and duration (30 min steps); service name shown on customer/provider bookings.
Verified: 54 convex tests (ownership, validation, quote, customer visibility, booking snapshot, signed-out sweep); browser run as provider + customer (create, validation error, edit, profile, book, provider sees it, disable hides it, archive, customer redirected away).
Not done: service images (no file storage yet), category per service, quote workflow after a quote-required request (provider just sees the request).

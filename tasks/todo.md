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
- [x] S3 Availability: weekly hours + breaks, blocked time, customer slot filtering, server-side enforcement (day/week/month calendar views not built)
- [~] S4 Customer: favourites DONE; booking detail, reschedule request, profile/settings still open
- [x] S5 (reviews) was built together with S4: see review below
- [x] S5 Reviews: eligibility, duplicate guard, aggregates (report/moderation moves to S7)
- [x] S6 Notifications: in-app bell + centre, realtime (email not built: no email integration)
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

## S3 review (2026-10-10)
Done: `workingHours` + `timeOff` tables; `availability.{mine,setHours,addTimeOff,removeTimeOff,forProvider}`; Auckland time helpers (DST-safe); `bookings.create` refuses times outside hours/breaks/closed days/blocked time/accepted bookings (providers who never set hours are only checked against blocks and accepted bookings); `/provider/availability` (7-day editor with breaks, blocked time list); booking page shows only slots that fit the chosen duration (30 min starts), disables closed days, drops past times.
Verified: 60 convex tests (DST round trips, validation, windows/breaks/busy, pending does not reserve, create enforcement, owner-only blocks); browser run as provider + customer (hours saved/validated/persisted, weekends and Wednesday lunch break reflected, block removes overlapping slots and removal restores them).
Shortcuts: busy minutes use a fixed 1440-minute day (off by an hour on the two DST-change days); no month/day calendar views; the provider dashboard WeeklyCalendar still shows bookings only.
Demo data: Alex Morgan's hours were left Mon-Sun 8-5 (same as the old default).

## S4 (favourites) + S5 (reviews) review (2026-10-10)
Done: `favourites` table, `favourites.{toggle,mineIds,listMine}`, heart buttons on search and profile (return to the same filtered page), `/favourites`, header link, middleware guard; `reviews` table, `reviews.{create,forProvider,mine}` (completed bookings only, owner only, one per booking, 1-5 stars, text optional <=1000, first name only shown), `/bookings/[id]/review` with a star picker, "Leave a review"/"Reviewed" on My bookings, reviews list on the provider profile, recent reviews card + sidebar item on the provider dashboard.
Verified: 65 convex tests; browser run as customer + provider (heart signed-out -> sign-in, heart keeps filters, favourites list/remove, request -> accept -> complete -> review, required-star validation, review on profile and provider dashboard, rating 4.9 (28) -> (29)).
Notes: provider rating is updated incrementally so the seeded placeholder rating keeps its weight (the demo "Alex Morgan" rating drifted from 4.9/28 to roughly 4.8/30 during testing). Review reporting/hiding is S7. Booking detail page for customers, reschedule requests and account settings are still open.

## S6 review (2026-10-10)
Done: `notifications` table; `notify()` helper called inside the booking/review mutations (request -> provider; accept/decline/complete/provider-cancel -> customer; customer-cancel -> provider; review -> provider); `notifications.{mine,unreadCount,markRead,markAllRead}`; header bell with live unread badge (desktop + mobile), `/notifications` live list with skeleton/empty states, click-through marks read; middleware guard.
Verified: 71 convex tests (each trigger, refused transitions send nothing, owner-only read/mark, orphan seeded providers); browser run with two sessions: provider page updated live (badge none -> 1, new item) when a customer booked, click opened the booking and cleared the badge, customer notified on accept, provider notified on cancel, signed-out redirected.
Not done: email notifications, reschedule-request notice (feature not built), notification preferences, pruning old rows.

## S4b review (2026-10-10)
Done as listed above. Verified: 78 convex tests (validation, normalisation, service area incl. case/own suburb, private fields by status and consent, hidden again after cancel, lists never carry email/phone/address/notes, getForCustomer isolation, setServiceAreas ownership/limits); browser run as customer + provider + signed-out/other-role (outside-area error with live hint, share toggle needs a phone, provider sees suburb only until accepting, then address/notes/contact, customer detail page, cancel from detail, 404 across roles).
Notes: legacy bookings have no address (shown as "not recorded"); a provider-side contact back to the customer is not built (customer-to-provider sharing only); suburb is stored as typed.

# Backlog after S4b (user's priority order, 2026-10-10)

2. [x] Booking emails and reminders (Resend): see the review below. Needs `RESEND_API_KEY` on each deployment; a real send is unverified until a key is set.
3. [x] Password reset and email verification: see the review below.
4. [x] Quotes and saved pricing: see the review below.
5. [x] Admin moderation and support: see the S7 review below.
6. [x] Provider profile editing and photo uploads: see the S9 review below.

---

## Emails and reminders review (2026-10-10)
Done: `convex/email.ts` (`renderEmail` + `send` internal action calling Resend, never throws, skips without a key); `notify()` now also queues an email to the recipient when they have an address, so every in-app notification is also emailed; `reminders.sendDue` + hourly cron send one reminder per side for accepted bookings starting within 24h (`reminderSentAt` guards repeats, `by_status_and_startsAt` index); README "Email (Resend)" section.
Verified: 86 convex tests (HTML escaping and absolute links, request shape with a mocked fetch, default sender, 4xx and network failures swallowed, emails queued by events and not for missing addresses or refused transitions, reminders once/only accepted/only within 24h); the deployed action runs on dev and skips cleanly with no key.
NOT verified: a real delivery through Resend (no API key available here). Not built: unsubscribe/preferences (comes with account settings), per-user quiet hours, email for the signed-out flows (password reset is priority 3).

## Password reset and email verification review (2026-10-10)
Done: `convex/model/authEmail.ts` (8-digit codes, Resend delivery, dev-only `AUTH_LOG_CODES`); `convex/auth.ts` enables Password `reset` whenever email is available and `verify` only when `REQUIRE_EMAIL_VERIFICATION=true`; `users.authFeatures` (UI flags only) and `users.markExistingVerified` (CLI); `/signin` shows "Forgot your password?" and a code step; `/signin/reset` (request, then code + new password).
Verified: 92 convex tests (code shape/entropy, Resend request, failures, dev logging, feature flags, markExistingVerified) and real flows in Chrome against the dev deployment with `AUTH_LOG_CODES`: sign up, forgot password for known and unknown addresses (identical message), wrong code rejected, short password blocked, correct code resets and signs in, code is single use, old password rejected; verification on: new account must enter a code, wrong code rejected, verified user signs in directly, existing demo account is prompted until `markExistingVerified` is run. Dev settings were restored afterwards (both features off).
NOT verified: delivery of a real email through Resend (no key). Known limits: a reset does not log out a browser holding an unexpired access token (up to an hour); there is no "resend code" button (signing in again sends a new one); test users e2e-reset-* and e2e-verify-* were created on the dev deployment.

## Quotes and price snapshot review (2026-10-10)
Done: bookings freeze `priceType`/`unitCents`/`estimateCents` at request time (hourly = rate x booked hours, fixed = price, quote = none until offered); quote workflow on quote-priced bookings: `bookings.submitQuote` (owning provider, request still open, not after the customer accepted) and `bookings.respondToQuote` (customer); `transition` refuses to accept a quote booking until the quote is accepted and records `agreedCents` (estimate or accepted quote); notifications + emails for quote offered/accepted/declined; customer detail shows price, quote note and Accept/Decline; provider detail has Send/Revise quote and hides Accept until the quote is accepted; the dashboard row shows "Send quote"/"Quote sent" instead of Accept; My bookings shows a price line.
Verified: 102 convex tests (snapshot immutability, quote validation, accept/decline/revise/final, accept blocked until quote accepted, set-price bookings, role and status guards, notifications, field exposure); browser run as customer + provider: quote service, book, customer sees "Quote to be sent", provider row shows Send quote, quote, customer declines, provider revises, customer accepts, provider accepts with Agreed $320; hourly estimate line "Estimated $90 ($45/hr x 2 hr)".
Not built: pricing changes after acceptance (e.g. a final invoice amount), a quote expiry, per-service deposit, price shown on bookings made before this change (they show no price line).

---

# S7: Admin moderation and support (backlog priority 5)

Decisions: provider suspension reuses `approved=false` plus `suspendedAt`, so every existing "approved only" check (search, booking, favourites, services, reviews, availability) excludes suspended providers automatically; `submitProfile` must refuse a suspended provider (it would otherwise reset them to pending); `requireUser` refuses suspended users, which blocks every write at once; suspending a user also suspends their provider; reviews are hidden/restored (never edited) with a reason, and the provider's rating is adjusted in the same transaction; every admin action writes an audit row.

- [x] Schema: users/providers suspension, reviews.hidden, reviewReports, disputes, auditLog
- [x] Provider suspend/reactivate, user suspend/reactivate (guards: not admins, not self)
- [x] Review reporting by the provider; admin hide/dismiss/restore with reasons and aggregate adjustment
- [x] Disputes opened by either participant; admin resolves with a note; both notified
- [x] Admin lists: providers, customers, bookings (+ detail, force cancel), reports, disputes, audit log
- [x] Provider dashboard banner for suspension; participants see dispute status
- [x] Tests for every rule; browser verification as admin, provider, customer

## S7 review (2026-10-10)
Done: provider suspension (approved=false + suspendedAt, so every public check excludes them; resubmitting and accepting are refused); account suspension via `requireUser` (all writes refused, reads and sign-in still work; takes the owner's listing down; reactivating the account does not silently relist); review reports by the provider; admin hide/dismiss/restore with required reasons, the rating adjusted exactly and reversibly, the review author and reporter notified; disputes opened by either participant on accepted/completed/cancelled bookings and resolved by an admin with a note shown to both; admin lists and filters for providers, accounts, bookings, report queue, disputes; admin booking detail with force-cancel; append-only audit log written by every admin action; suspension banners for the provider and the account; "Report a problem" on both booking pages; "Report this review" on the provider dashboard. Admin pages are guarded to 404 for non-admins before any data is fetched.
Verified: 114 convex tests (admin guards across every function, suspension reaches search/get/book/favourite/services/reviews/availability, resubmit and accept refused, cascade and deliberate reactivation, self/admin protection, exact rating maths and restore, report ownership and duplicates, dispute rules and notifications, booking list/detail/force-cancel, audit order); browser run as admin + provider + customer for every flow above, including the customer being blocked from saving a favourite while suspended and the rating returning to 4.8 (30) after cleanup.
Not built: categories and locations management (S8), an appeals flow (users contact support), admin notes on accounts, bulk actions, pagination beyond the newest 300 rows, notifying admins when a report/dispute arrives (they see the sidebar badges), moderation of text other than reviews (provider bios, service descriptions).
Test data left on dev: reviews/disputes/bookings tagged "S7a", resolved, plus the audit rows.

# Before deploying (checklist)

Vercel facts found on 2026-10-10 (project `localmarketplace-marketplace`):
- [ ] **Production Branch is still `claude/new-session-e1nnli`**, so a push to `main` only builds a preview (target null) and the production site stays on the last manual deploy. Until this is changed (Vercel dashboard: Settings > Environments > Production > Branch Tracking > `main`; the API refused the field), production must be updated by redeploying with target production. The 2026-10-10 deploys of `7c55beb`, `6470e7b` and `78183b2` were done that way.
- [ ] Production `NEXT_PUBLIC_CONVEX_URL` points at the DEV Convex deployment (`benevolent-boar-32`). Fine while everything is dev; switch it to the production deployment URL before real users.
- [ ] `NEXT_PUBLIC_CONVEX_URL` exists for the Production target only, so Preview deployments (other branches) build but fail at runtime. Add it for Preview if previews are needed.
- [ ] Vercel Authentication is on for `*.vercel.app` (all except custom domains), so the site needs a Vercel login to open. Add a custom domain or relax this when the site should be public.
- [ ] Convex `SITE_URL` is a localhost URL, so links in emails (bookings, reminders) point at localhost. Set it to the real origin on each deployment.

The repo is public and the demo data is dev-only. Do these before pointing anything at a production Convex deployment:

- [ ] Delete `TEST_ACCOUNTS.md` (it lists demo and E2E account passwords). They stay in git history, so never create these accounts, or reuse those passwords, on prod.
- [ ] Remove the demo/E2E data from any shared deployment: users `*@localhub.nz` and `e2e-*@example.nz`, provider "E2E Test Provider (delete me)", and the demo bookings, services and reviews created while testing.
- [ ] Don't run `seed:run`, `seed:setupDemoAccounts` or `seed:setDemoPhotos` on prod (demo providers, placeholder 4.8/12 ratings, stock portraits).
- [ ] Replace the placeholder ratings on seeded providers, or remove those providers.
- [ ] Decide the support contact shown to suspended users (the banner says "Contact support" without a link).
- [ ] Grant the first admin with `npx convex run users:grantAdmin` on prod (CLI-only by design).
- [ ] Set the production auth env vars and site URL for Convex Auth; confirm `NEXT_PUBLIC_CONVEX_URL` points at prod.
- [ ] Set `RESEND_API_KEY`, a verified-domain `EMAIL_FROM` and `SITE_URL` on the production deployment, then send a real test booking.
- [ ] Turn on `REQUIRE_EMAIL_VERIFICATION=true` on prod (run `users:markExistingVerified` first only if prod already has users you trust). Never set `AUTH_LOG_CODES` on prod.
- [ ] Known gaps: no rate limiting, public provider queries expose `userId` (see Phase 0 deferred list).

---

# S4b: Job details, service area, booking detail, contact sharing (from the review notes)

Gap: a request carries no service address or access notes, the summary shows the provider's suburb as the job location, and a provider can't reach the customer once they accept.
Decisions: explicit contact sharing (customer opts in per booking; phone + email revealed only after acceptance) instead of a message thread; full address and access notes visible to the provider only while a booking is accepted/completed (requested shows suburb only); service area is an optional per-provider suburb list (empty = serves anywhere, so existing listings keep working).

- [x] Schema: bookings address/suburb/accessNotes/customerPhone/shareContact; providers serviceSuburbs
- [x] bookings.create validates the address and the provider's service area; listIncoming stops returning raw documents (it leaked customerEmail)
- [x] getForCustomer + richer getForProvider (private fields gated by status and consent)
- [x] providers.setServiceAreas + UI on /provider/services
- [x] Booking form collects address, suburb, access notes, optional phone + share toggle; summary shows the real location
- [x] /bookings/[id] customer detail page; provider detail shows address/contact when allowed
- [x] Tests for every rule above; browser verification

---

# Repo reorganisation (2026-10-10)

The repo was set up as a pnpm + turbo monorepo for several apps; it is one app. Flattened to a single Next.js app at the root: `apps/marketplace/{app,components,lib,public,middleware.ts,next.config.mjs,PRODUCT.md}` moved to the root with `git mv` (history kept), `packages/design-tokens/tokens.css` became `app/tokens.css`, and `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, both extra `package.json` files and the workspace package were removed. One `package.json` (name `localo`; `jose` is now a dev dependency; `pnpm typecheck` added), one `tsconfig.json` (`convex/` keeps its own), one `.env.local`. `pnpm dev` now uses port 3100 to match the README and TEST_ACCOUNTS.md.
Verified from the new layout: typecheck, 114 tests, `next build`, and a browser smoke test.
Older entries above (and `docs/superpowers`) still mention `apps/marketplace/...` paths; they are history and were not rewritten.
Vercel: the project `localmarketplace-marketplace` (team ans-projects) still had Root Directory `apps/marketplace`, so the deployment for the flatten commit failed ("The specified Root Directory does not exist"). Fixed on 2026-10-10: Root Directory is now the repository root, and `main` was redeployed (READY, production). `AGENTS.md` still contains a block that turbo wrote about Turborepo; it is stale now.

---

# S9: Provider profile editing and photo uploads (backlog priority 6)

Decisions: approved providers edit name/bio/category/suburb/rate directly with the same validation as the application (no re-review; moderation is suspension); pending/rejected keep the application form; suspended cannot edit. Photos use Convex file storage: owner-only upload URLs, type (jpeg/png/webp) and size (5 MB) checked on the stored file before it is attached, the old file deleted when replaced. One profile photo (falls back to the seeded demo image) and a work gallery of up to 6.
Known limits to record: the type check uses the stored content type, not the file bytes; an upload that is never attached stays in storage; no admin tool to remove a photo (suspend instead).

- [x] Schema: providers.photoStorageId, providerPhotos
- [x] providers.updateProfile, generateUploadUrl, setPhoto/removePhoto, gallery add/remove/list; public queries resolve storage URLs
- [x] next.config remote image pattern; ProviderPhoto uses the URL
- [x] /provider/profile page: details form, photo, gallery; sidebar Profile link
- [x] Gallery section on the public profile
- [x] Tests; browser verification

## S9 review (2026-10-10)
Done: `providers.updateProfile` (approved providers edit name/bio/category/suburb/rate directly, same validation as an application; pending/rejected are told to use the application form; suspended refused); Convex file storage uploads: `generateUploadUrl` (owner only), `setPhoto`/`removePhoto` (one profile photo that replaces the seeded image everywhere via `withPhotoUrl`, old file deleted on replace), work gallery of up to 6 (`addGalleryPhoto`/`removeGalleryPhoto`/`gallery`/`galleryMine`); files are checked (JPEG/PNG/WebP, 5 MB) and a bad file is deleted and reported as a result; `/provider/profile` (photo, details, gallery; client-side checks too), gallery on the public profile ("Recent work"), sidebar Profile now goes there; `next.config` allows `*.convex.cloud` images.
Verified: 124 convex tests (edit rules, upload URL access, photo in get/list/mine/favourites with the storage id hidden, replace/remove/fallback, rejected types and sizes deleted, gallery limit/captions/ownership/approval, suspended refused, signed-out sweep) and a browser run with real uploads to Convex storage (so the real content-type check ran): wrong type and >5 MB blocked client-side, profile photo upload shows on the editor, search card and public profile, details edit goes live, invalid rate blocked, two gallery photos appear on the public profile, customers are redirected away, cleanup restored the seeded photo and bio.
Known limits: convex-test does not record a content type, so unit tests supply it (the real rule `imageProblem` is tested directly; the real storage metadata was exercised in the browser); the type check trusts the stored content type, not the file bytes; an upload that is never attached stays in storage (no cleanup job); there is no admin tool to remove a photo (suspend the listing); no image cropping or resizing; edits to an approved profile are not re-reviewed.

---

# S10: Account settings (mockup screen 10)

Decisions: one `/account` page for every signed-in role; email is shown read-only (changing it needs a verification flow); a user-level contact phone (`contactPhone`, not the auth `phone` field) and profile photo (Convex storage, same checks as provider photos); up to 5 saved addresses with a default, used to prefill the booking form; email preferences per category (booking updates, reminders, reviews & moderation) that only affect emails, never the in-app notification; account-safety emails (suspension, reactivation) cannot be turned off. No password change while signed in (use the reset flow) and no account deletion yet.

- [x] Schema: users.contactPhone/imageStorageId/emailPrefs, savedAddresses
- [x] account.{mine,updateProfile,photo upload,addresses,setEmailPrefs}
- [x] notify() honours email preferences
- [x] /account page; header and tab bar links
- [x] Booking form: saved addresses prefill
- [x] Tests; browser verification

## S10 review (2026-10-10)
Done: `account.{mine,updateProfile,generateUploadUrl,setPhoto,removePhoto,addAddress,removeAddress,setDefaultAddress,setEmailPrefs}`; `users.contactPhone`, `imageStorageId`, `emailPrefs` and `savedAddresses` (max 5, the first is the default, removing the default promotes another); `notify()` skips only the email when the category is off (updates / reminders / reviews and moderation) and always emails account-safety kinds (suspension, reactivation); `/account` for every role (profile with photo, saved addresses, email notifications, password pointer), "Account" in the header and the mobile Profile tab, route guarded by the middleware; the booking form prefills from the default saved address and saved phone and offers a picker; `PhotoUpload` moved to `components/` and serves provider and account photos. Also: the old blue tokens now resolve to the Localo forest green site-wide, and Inter / Instrument Serif are self-hosted (a Google Fonts fetch failure broke one Vercel build).
Verified: 133 convex tests (normalisation, phone validation, photo set/replace/remove, address limits/default rules/privacy, category mapping, preferences gating real scheduled emails, suspension email always sent); browser run as the customer (profile and phone validation, real photo upload, two addresses, default switch, booking prefill + picker + a booking with the prefilled address, preference persistence, admin can open the page), data restored afterwards. The run also caught a duplicate `id="email"` on the page, fixed.
Not built: changing the email address, changing the password while signed in (use the reset flow), deleting the account, per-event email choices, SMS.

---

# S11: Reschedule requests (from the original brief)

Decisions: either participant can propose a new start time for an ACCEPTED, not-yet-started booking (duration unchanged); the other side accepts or declines; the proposer can withdraw; one pending request per booking; accepting re-validates the new time against the provider's hours, breaks, blocked time and OTHER accepted bookings (the booking itself is excluded, so small shifts work); accepting moves the booking, records a "rescheduled" event and resets the 24h reminder; cancelling/completing a booking withdraws a pending request; suspended providers cannot propose or accept. The check that create used inline moves to a shared `isTimeAvailable`.

- [x] Schema: rescheduleRequests
- [x] Shared isTimeAvailable (+ exclude a booking); bookings.create uses it
- [x] reschedules.{propose,respond,withdraw}; latest request on the detail queries
- [x] Customer and provider detail UI; notifications/emails
- [x] Tests; browser verification

## S11 review (2026-10-10)
Done: `rescheduleRequests`; `reschedules.{propose,respond,withdraw}`; shared `isTimeAvailable` (with a booking excluded, so a booking can shift against its own current slot) now also used by `bookings.create`; accepting moves the booking, keeps the duration, records a "rescheduled" event, resets the 24h reminder, and re-validates at that moment (a time taken in the meantime returns an error and leaves the request pending); cancelling/completing withdraws an open request; the latest request is returned by both detail queries; `RescheduleBox` on the customer and provider booking pages (ask, accept/keep original, withdraw, last outcome); notifications and emails for requested/accepted/declined/withdrawn.
Verified: 146 convex tests (either side proposes, duration kept, only accepted future bookings, one pending at a time, hours/blocks/other bookings respected but not the booking itself, suspended provider refused, accept moves + event + reminder reset, decline, stale time refused, strangers and signed-out refused, withdraw, auto-withdraw on cancel/complete, new slot held and old slot freed, reminder re-sent at the new time) and a browser run as customer + provider (out-of-hours refused, customer proposes and provider accepts, provider proposes and customer declines, customer proposes and withdraws, history and notifications, box disappears on cancel).
Not built: proposing a different duration, an availability picker in the request form (a date-time input with server validation instead), rescheduling a not-yet-accepted request (cancel and rebook instead), a limit on how many times a booking can be moved.

---

# S8: Admin-managed categories and locations (last item of the original plan)

Decisions: `categories` table (slug = the stable key providers already store, label, icon, colour, order, enabled), seeded from the six built-ins; with no rows the built-ins apply, so nothing breaks before seeding. Disabling a category hides it from browsing and from new selections; existing listings stay visible (removing a provider is suspension). Icons and colours come from the fixed set the app actually draws. Locations: `marketplaceSettings.launchCity` replaces the hard-coded "Auckland", and a `suburbs` list with enable/disable; when ANY suburb is configured, booking job suburbs, provider profile suburbs and service-area suburbs must be an enabled one (no rows = no restriction, so existing data keeps working); "Mt" and "Mount" compare equal. Every admin change writes an audit row. No nationwide/multi-city features.

- [x] Schema: categories, suburbs, marketplaceSettings
- [x] categories.{list,initDefaults,create,update,setEnabled,move}; profile saves validate against active categories
- [x] locations.{overview,adminList,setCity,addSuburbs,setSuburbEnabled,removeSuburb}; enforcement in booking, profile and service areas
- [x] UI: dynamic categories (home, search, register, profile), launch city text, suburb suggestions
- [x] Admin pages: /admin/categories and /admin/locations
- [x] Tests; browser verification

## S8 review (2026-10-10)
Done: `categories` (slug is the stable key providers store; label, icon, colour, order, enabled) with built-in fallback until an admin saves them (`initDefaults`), create/update (slug never changes)/enable/disable/move with a floor of one enabled category and a ceiling of 20; profile applications and edits validate against ACTIVE categories (an unchanged category or suburb stays valid on edit); `marketplaceSettings.launchCity` replaces the hard-coded "Auckland"; `suburbs` with enable/disable/remove, bulk add (deduped across spellings, "Mt"/"Mount" equal), a one-click Auckland starter list; when any suburb exists, booking job suburbs, profile and application suburbs and service areas must be enabled ones (none = no restriction); public `locations.overview` feeds suggestions and the city name; every admin change is audited; UI: home chips, search filter, register and profile pickers, favourites, public profile and admin dashboard read the managed categories; suburb inputs offer suggestions; `/admin/categories` and `/admin/locations`.
Verified: 159 convex tests (helpers, defaults and idempotence, validation, ordering, floor/ceiling, admin-only, audit, profile validation with disabled categories, suburb key normalisation, bulk add dedupe, enforcement in booking/profile/application/service areas, own-suburb exemption) and a browser run: non-admin gets 404; save built-ins, add, duplicate refused, rename, reorder and disable reflected on home chips and the search filter while the provider in a disabled category stays listed; the provider editor offers enabled + own; 52 suburbs added, a Whangarei booking and profile edit refused with a clear message, suggestions on the booking form, unchanged edit with a disabled own suburb allowed; dev data restored (all suburbs removed, categories renamed back, extra "Roofing" left disabled).
Not built: deleting categories (disable only, so providers keep theirs), per-suburb pricing or provider counts, multiple cities, importing suburbs from a file.
Dev data left: the six categories are now saved in the database plus a disabled "Roofing".

---

# Location search, Part 1: geography data, import and validation (no UI change)

Sources (verified 2026-10-10, all public ArcGIS feeds, CC BY 4.0, no API key): LINZ NZ Suburbs and Localities (6,563 records, item modified 2026-06-09), Stats NZ Regional Council 2025 (17) and Territorial Authority 2025 (68). Downloaded GeoJSON files are accepted instead via `--linz/--regions/--tas`.

- [x] `places` (recognised geography, separate from marketplace coverage) and `geoImports` (run, source edition/licence/attribution) tables
- [x] `scripts/geo/transform.mts` (pure): keys, point-in-polygon, TA matching from LINZ's own text, flags, report
- [x] `scripts/geo-import.mts`: dry run by default, `--apply` upserts through `convex run` (internal functions, no public endpoint)
- [x] `convex/geoImport.ts`: batched idempotent upsert keyed by (layer, sourceId), retire-not-delete, refuses to retire an unwritten layer
- [x] Tests on labelled fixtures (including re-import = no duplicates); 169 tests and both typechecks pass

## Part 1 review (2026-10-10)
Dry run against the live feeds: 6,648 places (17 regions, 68 TAs, 1,174 suburbs, 2,002 localities, 3,387 non-selectable bays/lakes/islands etc.), no duplicate source IDs, 555 names with macrons preserved, 262 duplicate-name flags, 144 multi-council places, 1 centroid/TA disagreement (John Creek), 0 unmatched TA names, 0 unresolved regions.
Auckland boundary evidence: TA 076 = 286 places, Regional Council 02 = 280, LINZ major name "Auckland" = 175. The six only in the TA: Buckland, Lake Puketi, Mangatāwhiri, Mangawhai, Pukekohe East, Whakatīwai (they straddle the region edge).
NOT done: nothing written to any Convex deployment; `suburbs` table untouched and still enforced; no UI. TA-to-region links are not stored (suburbs carry their region directly).

# Location search, Part 2: coverage, provider service areas, migration review (2026-10-10)
Nationwide: once `places` exist, coverage = recognised and not under a `closedAreas` row (region, council area or suburb; closing a wider area closes what is inside). The legacy `suburbs` list and city setting go dormant (still used if no geography is imported). Providers: `baseAreaId` (that suburb only) + `serviceAreaIds` (suburbs, councils, regions) picked via `searchPlaces`; booking uses `providerServes`. Providers not yet migrated keep their old rules (incl. empty list = anywhere); `geoMigration:migrateProviders` links exact matches, queues ambiguous/unmatched in `locationReviews` (admin resolves on /admin/locations), then empty list means base suburb only.
Verified: 179 tests, typecheck; dev dry-run: 9 providers, 9 base suburbs link exactly, 0 reviews. Migration NOT yet run for real; browser pass of the new admin/provider UI not done.
Not built: autocomplete UI, search by place IDs, empty states (Part 3); alt-name matching (altKeys unindexed); disambiguating an ambiguous suburb at sign-up (goes to review).

# Location search, Part 3: autocomplete, search by place, empty states (2026-10-10)
`providerAreas` (search rows: "serves" the exact place, "within" for ancestors) rebuilt by `syncProviderAreas` on any change; `providers.list({placeId})` is indexed, not a scan. `resolveSearchPlace` -> unrecognised | not_launched | ambiguous | ok (region beats council beats suburb of the same name; two of one kind ask). `PlaceInput` ARIA combobox on home and /search (plain text field without JS). Empty states: unrecognised, not launched, no one serves the place, none in that category/keyword, filters exclude. Old `?suburb=` links still work.
Verified: 185 tests, typecheck, SSR checks against the dev data (each empty state, "Which Springfield?" with councils/regions, Ponsonby 3 vs Auckland wider). Dev migration run (9 providers linked) and syncAll. NOT verified: interactive combobox in a browser (Chrome extension unavailable).
Not built: booking-form suburb autocomplete (still free text, validated), alt-name matching, a "city" kind (cities are found via their council, region or locality names).

Part 3 addendum: browse panel like Trade Me (Region > District > Suburb selects, each starting "All of ..."; Apply picks the most specific). `placeParents` edges (suburb>council, council>region, derived from the source data; rebuilt on every import) + `locations.children`. Dev re-imported. 187 tests. Not browser-tested (Chrome extension unavailable).

Part 3 addendum 2: picker is Region > District > Suburb. Districts = council areas, except Auckland where its 21 local boards (Auckland Council "Local Electoral Boundary" layer 2, 2025 elections, CC BY 4.0) replace the single council entry (TA flagged `has_districts`; local boards belong to council 076 by definition). Stats NZ TA subdivisions were tried and dropped: they leave ~83% of suburbs outside any subdivision. 6 border suburbs (Buckland, Mangawhai...) have no local board and sit under their other council. A board with no suburbs (Aotea / Great Barrier) does not appear in the picker. Dev re-imported; 190 tests; browser-checked Auckland (20 boards listed + Waikato District) and Canterbury (14 districts).

# Category hierarchy (2026-10-10)
Audit: `categories` was flat (slug/label/icon/hue/order/enabled, max 20); homepage chips already came from Convex but showed every enabled category and linked to /search; providers had exactly one `category` slug matched by equality; no images, featured flag, delete, sub-levels or category page.
Done: categories gain optional `parentId` (main > subcategory > service, max 3 levels, child slugs prefixed with the parent's so "Cleaning" can exist twice), `featured` (missing = true for a main category, so nothing moves on the homepage), `imageStorageId`; `by_parent` index; cap 300. Providers gain `categorySlugs` (missing = just `category`); `providers.list({category})` matches the category and everything below it. Disabled parent hides its branch. Admin: create under a parent, feature, image upload, reorder among siblings, enable/disable, delete only when no children and no provider uses it, "Add example categories" (data, idempotent). Homepage row is a preloaded reactive query (`FeaturedCategories`) with a "Browse all categories" card; /categories and /categories/[slug] (breadcrumbs, subcategory cards, the same location/rating/price filters via the shared `ProviderSearch`); provider register/profile have a `CategoryPicker` (primary + any number of others). 200 tests; browser-checked as admin, provider, customer (reactive unfeature without reload, 404 for unknown slug, mobile).
Not built: linking a provider's priced services to catalogue categories; category images on provider cards; dev test data left: example categories added.

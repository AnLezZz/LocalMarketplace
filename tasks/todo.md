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

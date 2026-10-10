# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two audiences with equal design weight (confirmed): customers, meaning New Zealand householders who need a local pro and mostly book from a phone; and providers, meaning sole traders and small businesses who apply, get vetted, and then accept or decline booking requests. A small third group, admins, review provider applications (a staff tool, secondary). The launch is one NZ city, multi-vertical (launch city not yet decided; the repo copy and seed data lean Auckland).

## Product Purpose
Localo is a local-services marketplace across multiple verticals. A customer finds an approved provider, picks a service, chooses a time from the provider's real availability and sends a request; the provider accepts or declines (or sends a quote first, for variable work). Providers apply and are approved by an admin before they appear in search. Success for the current phase: real people can sign up, providers get vetted, and a booking request gets answered, with no unauthenticated writes.

## Positioning
Built: one request pipeline with two price paths, fixed or hourly services priced up front and quote-required services priced by the provider after the request. A request is never a confirmed booking until the provider accepts; pending requests do not hold a time slot, and acceptance checks for clashes atomically. Customers pay the provider directly, off-platform.
Planned, not built: payment through the platform (payment protection, commission, deposits, refunds, payouts), job posting with competing quotes, recurring bookings, in-app messaging. Local density in one launch city rather than national breadth, although location data covers all of New Zealand.

## Operating Context
New Zealand: locale en-NZ, times in Pacific/Auckland, prices in NZD (GST applies). Customers mostly use phones, often one-handed and in a hurry to get something fixed. Providers check requests between jobs. One Next.js 15 (App Router) app and one Convex backend at the repository root; design tokens live in `app/tokens.css` and `app/landing.css`.

## Capabilities and Constraints
Built today:
- Customers: browse by category tree (main category, sub-category, service) or search by keyword, price, rating and New Zealand place (region, district, suburb); provider profiles with work galleries and reviews; a guided four-step booking flow (service, date and time, details, review and submit); answers to the provider's booking questions; saved addresses and optional contact sharing; a confirmation page that says the request is pending; booking list and detail, cancel, request a different time, accept or decline a quote, report a problem; leave a review after a completed job; favourites; notifications (live, clearable, auto-removed after 60 days) and email notifications with preferences; a customer account area with a side menu.
- Services: fixed, hourly or quote pricing, a duration (15 minutes to 12 hours), a category, and a location mode: at the customer's address (checked against the provider's service area), at the provider's premises (venue snapshot, no home address collected), online (public note, private meeting link shown only after acceptance), or the customer's choice of the first two. Up to 8 booking questions per service. The booking keeps a snapshot of the location, price and answers as they were when requested.
- Providers: apply and get approved; manage profile, photo and gallery, services, service areas, working hours, breaks and time off; a dashboard split into overview, bookings (pending, upcoming, history, all, paginated), calendar (week view, Auckland time), availability, services and reviews; accept, decline, complete, cancel, quote, propose a reschedule; add a meeting link to an online booking. Dashboards update live.
- Admins: approve or reject provider applications, suspend and reactivate providers and customers, moderate reviews and reports, resolve disputes, manage the category tree (images, featured, reorder), see an audit log and all bookings.
- Platform: email (Resend) for booking notifications and 24-hour reminders; password reset and optional email verification; a nationwide place database imported from open data (LINZ and Auckland Council local boards) that drives search and service-area coverage.
Data shown about a provider must be real: ratings and review counts come from reviews written on the platform (the seed data's placeholder ratings are not real).
NOT built, so the UI must not show them as if they exist: payments or escrow, wallet, deposits, refunds, in-app messaging or chat, live arrival tracking, push notifications, job posting with competing quotes, recurring bookings, "starting from" prices, quote expiry or price changes after acceptance, structured provider verification (identity, licence or insurance evidence), licensed/insured/verified badges, arrival-time estimates, street-address autocomplete (free-text entry, with the suburb checked against the place database), changing email or password while signed in, deleting an account, business reporting, a customer overview page.
Unverified: real email delivery through Resend (never run with a live key); the booking confirmation page and admin dashboards do not update live.
Undecided: launch city, commission levels, how verification badges will be sourced, which NZ address provider to use for autocomplete.

## Brand Commitments
The product name is Localo (renamed from LocalHub; the lowercase package and seed-account identifiers like @localhub.nz keep the old name). The customer-facing surfaces use an ivory background, forest green primary actions and an Instrument Serif display face over Inter, with soft white cards and pastel category tiles; the provider and admin dashboards still use the older blue token set and are due to be brought in line. Mobile-first responsive web app with a bottom tab bar on phones.

## Evidence on Hand
Nine providers exist on the development deployment (six synthetic seed providers in Ponsonby, Grey Lynn and Mt Eden, plus test accounts), some with stock portraits in `public/images`; a business without a photo shows a stand-in photo for car detailing, gardening or moving help, otherwise initials. Seed ratings and reviews are placeholders, not real. No logos, testimonials or real reviews exist. Do not fabricate any. Test accounts and passwords are development-only (`TEST_ACCOUNTS.md`) and are removed before deploying.

## Product Principles
1. Show only what is true: no imagery or claims for features that do not exist yet.
2. Phone first, thumb reachable: the main action on every screen is obvious and within reach.
3. Trust is the product: make provider identity, price and status clear and unambiguous.
4. One system for customers, providers and admins, with simpler layouts rather than a different look for staff tools.
5. Errors and empty states are first-class screens, not afterthoughts.

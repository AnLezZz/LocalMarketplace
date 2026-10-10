# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two audiences with equal design weight (confirmed): customers, meaning New Zealand householders who need a local pro and mostly book from a phone; and providers, meaning sole traders and small businesses who apply, get vetted, and then accept or decline booking requests. A small third group, admins, review provider applications (a staff tool, secondary). The launch is one NZ city, multi-vertical (launch city not yet decided; the repo copy and seed data lean Auckland).

## Product Purpose
Localo is a local-services marketplace. A customer finds an approved provider (cleaning, gardening, handyman, pet care, car detailing, moving help), requests a time, and the provider accepts or declines. Providers apply and are approved by an admin before they appear in search. Success for the current phase: real people can sign up, providers get vetted, and a booking request gets answered, with no unauthenticated writes.

## Positioning
Planned (from the design spec, not yet built): one job pipeline with two entry paths, instant-book for fixed-price services and quotes for variable trades, paid through the platform so payment protection, reviews and repeat booking only exist on-platform. Local density in one city rather than national breadth.

## Operating Context
New Zealand: locale en-NZ, times in Pacific/Auckland, prices in NZD (GST applies). Customers mostly use phones, often one-handed and in a hurry to get something fixed. Providers check requests between jobs. Stack is an existing Next.js 15 + Convex app (apps/marketplace) with a shared tokens package (packages/design-tokens).

## Capabilities and Constraints
Built today: browse and search approved providers by category, suburb and keyword; provider profile page; sign-in and sign-up (email and password); a signed-in customer can request a booking for a time window with a description, see their bookings, and cancel; a provider can apply, see application status, and accept, decline, complete or cancel requests; admins approve or reject applications with a reason.
Data that exists per provider: name, bio, category, suburb, rate and rate basis (hourly or fixed), rating average, review count.
NOT built, so the UI must not show them as if they exist: payments or escrow, wallet, reviews, in-app messaging or chat, live arrival tracking, push notifications, provider photos or work galleries, licensed/insured/verified badges, arrival-time estimates, quotes.
Undecided: launch city, commission levels, how verification badges will be sourced.

## Brand Commitments
The product name is Localo (renamed from LocalHub; the lowercase package and seed-account identifiers like @localhub/design-tokens and @localhub.nz keep the old name). The user pinned the visual direction to a specific reference: an iOS-style on-demand home-services app (soft blue-white surfaces, white rounded cards, blue primary actions, pastel category tiles, avatar-led provider cards, status pills, mobile bottom tab bar), restyled for a mobile-first responsive web app.

## Evidence on Hand
Six synthetic seed providers (Sparkle & Shine Cleaning, Green Thumb Gardens, Fixit Fred, Happy Paws Walkers, Mirror Finish Detailing, Two Men & A Ute) in Ponsonby, Grey Lynn and Mt Eden, each seeded with a placeholder 4.8 rating and 12 reviews that are not real. No photographs, logos, testimonials or real reviews exist. Do not fabricate any.

## Product Principles
1. Show only what is true: no imagery or claims for features that do not exist yet.
2. Phone first, thumb reachable: the main action on every screen is obvious and within reach.
3. Trust is the product: make provider identity, price and status clear and unambiguous.
4. One system for customers, providers and admins, with simpler layouts rather than a different look for staff tools.
5. Errors and empty states are first-class screens, not afterthoughts.

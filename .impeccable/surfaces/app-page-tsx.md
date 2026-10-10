---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/layout.tsx","app/globals.css"]
---

# Surface brief: Localo web app (all routes)

Scope and visitor mode: Operate. Customers book from a phone; providers and admins complete tasks. Every route under apps/marketplace/app is in scope (home and search, provider page with booking form, sign-in, provider inbox and application pages, My bookings, admin). Visual replacement only: product truth, copy meaning, routes, server actions and Convex calls stay as they are.

Audience and constraints: customers and providers equally (confirmed), mobile-first responsive web, NZ locale. Show only data and features that exist (see PRODUCT.md: no escrow, chat, tracking, wallet, photos, licence badges, arrival times). Light theme: used in daylight, indoors and outdoors, mostly on phones.

Pinned reference (brief-pinned, beats any roll): an iOS-style on-demand home-services app: soft blue-white surfaces, white rounded cards with hairline borders, one strong blue primary with a bright blue gradient on main buttons, pastel service tiles, avatar-led provider cards, status pills, bottom tab bar on mobile. No concept-seed roll: the direction is pinned by the user.

## Direction contract

THESIS: A calm, trustworthy phone-app feel for local help: one blue action per screen, everything else white cards on a pale blue-white ground. Refuses the category-default marketplace grid of identical stock-photo cards and the previous forest/ivory/serif look.

OWN-WORLD: Page #F0F5F9, cards #FFFFFF with 1px #E3EAF1 hairlines and soft two-layer shadows, 20px radii, pill chips. Ink #09090B, secondary text blue-grey #40495E. Primary #0A44DB with a 135deg gradient (#2271F0 to #0A44DB) on main buttons. Six pastel category tiles (mint, lime, amber, rose, sky, violet) with matching drawn SVG icons in one 1.75 stroke. Provider avatars are initials on deterministic tinted discs. Inter, tight bold headlines with a muted second line, tabular numerals for prices. Status pills: amber requested, blue accepted, green completed, neutral cancelled or declined. Bottom tab bar on phones, slim top bar on desktop.

STORY: A visitor understands in seconds they can find a local pro, see price and area, and request a time; a returning customer sees their bookings; a provider sees requests with clear actions; an admin sees applications to review. Trust comes from clarity, not decoration.

FIRST VIEWPORT: Home at 390px: location-free greeting headline with a muted second line, a large search field with suburb, category chips, then the 2-column pastel service tiles (real "from $X" and provider counts) with the first provider cards just visible above the bottom tab bar. At 1440px the same content in a centred 1080px column with 3-column tiles and 2-column provider cards.

FORM: pinned reference (user-chosen, Dribbble on-demand home-services app); no seed rolled. Signature motion: tiles and provider cards rise and fade in once on load with exponential ease-out, reduced-motion respected.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

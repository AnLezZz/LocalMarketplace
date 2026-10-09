# LocalHub: Local Service Marketplace Business and Product Design

Date: 2026-10-09
Status: Draft for review
Builds on: existing LocalHub MVP slice (Next.js + Convex; providers, bookings, bookingEvents)

## 1. Agreed understanding

- Goal: a defensible plan to reach a first paying cohort for a SaaS-style local service marketplace.
- Revenue model: marketplace take rate. Free to join for customers and providers; revenue is commission on jobs paid through the platform.
- Launch wedge: multi-vertical, single city, New Zealand.
- Approach: hybrid. Instant-book for fixed-price services plus quotes for variable trades, sharing one job pipeline.

Assumptions to validate: all fee percentages, cost figures and provider-count targets below are placeholders.

## 2. Business model

**Customers:** free to browse and post. About 5% service fee on instant-book jobs, covering payment processing and cover guarantees.

**Providers:** free to join. Commission only on completed on-platform jobs: about 12% instant-book, about 10% quoted. Benchmark against Builderscrack and Trade Me Services before fixing.

**Protecting the take rate**
- Contact details hidden until a booking is paid.
- Payment protection, cover guarantee, reviews and repeat-booking discounts apply only to on-platform jobs.
- Providers with high rebooking rates earn a lower commission.

**Later revenue (not v1):** featured placement; Pro plan (about 8% commission); insurance and compliance add-ons.

**Unit economics check:** a $120 job yields about $14.40 commission plus $6 service fee = $20.40 gross, about $16 net after roughly $4.30 Stripe fees. Several hundred completed jobs per month are needed to break even for a small team.

## 3. Product flow

**One job lifecycle, two entry paths**
- Instant-book: customer picks provider and slot; job enters `requested`.
- Quote: customer posts job; 1 to 3 local providers quote; customer accepts one; job enters `requested` at the quoted price.
- Shared pipeline: `requested -> accepted -> paid_held -> in_progress -> completed -> paid_out`. Side exits: cancelled, declined, expired, disputed.
- Extend the existing `bookings.transition` mutation (transactional overlap protection) rather than replace it.

**Payments (Stripe Connect, NZ)**
- Express accounts for provider onboarding and verification.
- Destination charges with `application_fee_amount` for commission.
- Authorise on accept; capture on completion, or auto-capture 48 hours after job end if the customer does not respond. Deposits upfront for quote jobs above a threshold.
- Refunds and disputes handled through an admin review queue in v1.

**Trust and safety**
- Provider approval gate (ID, photo, business or GST number where applicable) before appearing in search (existing `approved` flag).
- Reviews only after a paid, completed job; two-sided.
- Contact masking and in-app messaging until paid.
- Licensed categories (electrical, gas, plumbing) require licence evidence, checked manually at launch.

**Roles and auth:** customer, provider, admin. Auth is not yet built and `/provider/[id]` is currently unauthenticated; this is the first fix.

## 4. Launch plan

**Categories:** home cleaning, lawn and garden, pet care (instant-book); handyman and small trades (quote).

**Geography:** one NZ city (Auckland largest pool; Wellington or Christchurch tighter), narrowed to 3 to 5 suburbs.

**Supply:** about 15 to 20 vetted providers per category (60 to 80 total) before opening to customers. Recruit via Facebook community groups, Trade Me and Builderscrack providers, trade associations. Offer zero commission on first 5 jobs and a founding-provider badge. Gate each category open to customers on a minimum (for example 10 providers available this week).

**Demand:** local SEO pages per category and suburb, neighbourhood Facebook groups, first-booking credit funded from the service fee. Emphasise recurring bookings (cleaning, lawns).

## 5. Build roadmap

| Phase | Scope | Gate to next |
|---|---|---|
| 0. Foundation | Auth and roles, close open provider page, provider approval flow, admin app | No unauthenticated writes |
| 1. Instant-book + money | Stripe Connect onboarding, authorise/capture/payout, extended state machine, emails | Real paid job end to end |
| 2. Trust | Reviews, in-app messaging, contact masking, dispute queue | 50 completed jobs |
| 3. Quotes | Job posting, quote submission and acceptance, conversion into shared pipeline | Quote-to-booking conversion measured |
| 4. Growth | Recurring jobs, commission tiers, SEO pages, referral credits | Gross margin per job holds |

Each phase gets its own implementation plan.

## 6. Metrics

Search-to-booking conversion; provider acceptance rate and time-to-accept; repeat rate; off-platform leakage (cancellations right after first contact); net revenue per job; jobs per provider per week; supply density per suburb and category.

## 7. Risks

- Thin supply across four categories at once.
- Quote-job leakage (mitigated by sequencing quotes last and masking contacts).
- Stripe Connect compliance and dispute load for a small team.
- Fee levels unvalidated against NZ competitors.

## 8. Out of scope for v1

Subscriptions or Pro plan, featured placement, insurance add-ons, multi-city expansion, native mobile apps, automated dispute resolution.

## 9. Open questions

- Exact commission and service-fee levels after competitor benchmarking.
- Which NZ city and which suburbs first.
- Licence verification process for regulated trades.
- Cancellation and refund policy details.

# LocalHub (MVP slice)

Turborepo + Next.js + Convex. Spec: local services marketplace PRD v1.1.

## Run
1. `pnpm install`
2. `npx convex dev` (log in once; creates the deployment and writes `.env.local` with the URL). Leave it running.
3. `pnpm convex:seed`
4. Put `NEXT_PUBLIC_CONVEX_URL` from `.env.local` into `apps/marketplace/.env.local`, then `pnpm dev`.
5. Open http://localhost:3000, request a booking, then open `/provider/<provider-id>` (id from the Convex dashboard) to accept/decline.

## Deploy
`npx convex deploy`, then Vercel: root dir `apps/marketplace`, env `NEXT_PUBLIC_CONVEX_URL` = the production URL.

## Notes
- Overlap protection: the `bookings.transition` mutation checks overlaps inside a Convex transaction, so concurrent accepts cannot double-book.
- `/provider/[id]` is an unauthenticated placeholder. Add auth before real users.
- Not yet built: auth, emails, reviews, admin app, provider approval flow.

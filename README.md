# LocalHub (MVP slice)

Turborepo + Next.js + Neon Postgres (Drizzle). Spec: local services marketplace PRD v1.1.

## Run
1. Create a Neon project, copy the connection string.
2. `cp .env.example .env` and set `DATABASE_URL`.
3. `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`
4. Open http://localhost:3000, request a booking, then open `/provider/<provider-id>` to accept/decline.

## Deploy
Vercel: root dir `apps/marketplace`, env `DATABASE_URL`.

## Notes
- Overlap protection is a Postgres exclusion constraint (`no_overlap`), so concurrent accepts cannot double-book.
- `/provider/[id]` is unauthenticated placeholder. Add auth before real users.
- Not yet built: auth, emails, reviews, admin app, provider approval flow.

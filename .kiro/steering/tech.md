# Tech steering — MassRecruit

> Encodes *how* we build, so Kiro generates code that matches the stack and conventions
> instead of introducing new ones.

## Stack (do not swap without updating this file)
- **Next.js 15 (App Router) + TypeScript**, React 19 Server Components + Server Actions.
- **Prisma** ORM on **PostgreSQL** everywhere: embedded Postgres locally
  (`npm run db:start`), throwaway instances in tests, managed Postgres (Neon / Vercel) in prod.
  Text search must use `mode: "insensitive"` (Postgres `LIKE` is case-sensitive).
- **Tailwind CSS 3** for styling; dark theme = `html.dark` overrides in `globals.css`
  (black background, hot-pink text). New colour utilities need a dark override there.
- **Auth:** username + password (`bcryptjs`), signed-cookie sessions with `jose`.
- **Email:** Resend HTTP API, with a console + `EmailLog` fallback when no key is set.
- **File storage:** Vercel Blob for consent PDFs; local `uploads/` fallback in dev.
- **Tests:** Vitest + fast-check (unit/property/integration); Playwright (E2E).

## Architecture conventions
- **Pure rules live in `lib/rules.ts`** — no DB or framework imports, so they are unit-
  and property-testable in isolation.
- **All DB mutations live in `lib/services.ts`** — framework-independent; they take an
  explicit `now`/`actor` where relevant so tests are deterministic.
- **User-facing failures throw `ServiceError`**; server actions map these to form errors
  and let real errors (and `redirect()`) propagate.
- **Server actions** (`app/actions.ts`) are thin: parse `FormData`, call a service,
  `revalidatePath`, then redirect or return `{ ok | error }`.
- **Enums as strings** validated by `isOneOf(...)` (keeps migrations simple).
- Prefer compare-and-set (`updateMany` with a guard in the `where`) for anything that can
  race: booking a slot, deciding an application, sending a reminder.

## Security defaults
- Parameterized queries only (Prisma). Strip SQL `LIKE` wildcards from search input.
- Validate + bound every user string; validate uploaded PDFs by magic bytes and size.
- Lock an account for 15 minutes after 5 failed sign-ins; Postgres-backed rate limits.
- Email ownership via single-use hashed tokens; admin powers require a confirmed email.
- Sessions: `__Host-` HttpOnly cookie; sign-out bumps `sessionVersion` to revoke tokens.
- Nonce-based CSP from `middleware.ts`; never add inline scripts without the nonce.
- No open redirects: only same-site relative `next` targets.
- Security headers (`X-Frame-Options`, `nosniff`, Referrer-Policy) in `next.config.ts`.

## Verification bar (run before claiming done)
`npm run typecheck && npm test && npm run build`, and `npm run test:e2e` for UI changes.
Tests start their own throwaway Postgres (ports 5434 / 5435), never the dev database.

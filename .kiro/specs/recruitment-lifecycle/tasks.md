# Tasks — MassRecruit recruitment lifecycle

Implementation plan Kiro worked through top-to-bottom. All complete.

- [x] 1. Scaffold Next.js 15 + TS, Tailwind, Prisma (PostgreSQL), Vitest, Playwright. (R7)
- [x] 2. Prisma schema: 8 entities + EmailLog; initial migration. (R3,R4)
- [x] 3. `lib/rules.ts` pure helpers: `.edu`, age, consent signature, slot validation,
      reminder schedule, time-zone conversion, school matching, CSV parser. (R1–R5)
- [x] 4. `lib/services.ts`: register/auth (+lockout), search, study CRUD (+consent
      versioning), apply, decide, book, reminders, admin verify. (R1–R6)
- [x] 5. `lib/session.ts` (jose cookies, `requireRole`), `email.ts` (Resend+log),
      `storage.ts` (Blob/local PDF). (R2,R4,R6)
- [x] 6. CSV seed → normalized tables + demo accounts + school aliases. (R1)
- [x] 7. Pages & server actions: browse/search, detail+apply, login/register, student,
      researcher dashboard/manage, admin + email log, cron route, consent-file route.
- [x] 8. Unit + property tests (fast-check) for every invariant in R2–R5. (R7.2)
- [x] 9. Playwright E2E for the full lifecycle, RBAC, search, PDF, lockout, headers.
- [x] 10. Accessibility pass + security headers + verify (typecheck, tests, build). (R7)
- [x] 11. Landing page + `/studies`; light/dark (black + hot pink) theme toggle.
- [x] 12. Hardening: Postgres everywhere, email confirmation, session revocation,
      rate limiting, nonce CSP, safe hosted seeding.

## Verification snapshot
- `npm test` → 88 passing (unit + property + Postgres integration).
- `npm run test:e2e` → 18 passing (Chrome, production build, Postgres).
- `npm run typecheck` and `npm run build` → clean. `npm audit` → 0 vulnerabilities.

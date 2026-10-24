# Structure steering — MassRecruit

> Where things go, so Kiro puts new code in the right place.

```
app/
  page.tsx                     public browse + search/filter (/)
  studies/[id]/                study detail + apply/consent form
  login/ register/             single sign-in with role choice; .edu sign-up
  student/                     applications, status, slot booking
  researcher/                  dashboard, new study, manage study
  admin/                       researcher verification (+ /admin/emails log)
  api/cron/reminders/          daily reminder job (Bearer CRON_SECRET)
  api/files/consent/[name]/    serves locally-stored consent PDFs
  actions.ts                   server actions (thin wrappers over lib/services)
components/                    ActionForm + UI primitives (ui.tsx)
lib/
  rules.ts                     pure business rules (testable, no I/O)
  services.ts                  all DB business logic
  session.ts                   signed-cookie sessions, requireRole, homeFor
  email.ts  storage.ts  csv.ts  db.ts
prisma/
  schema.prisma                8 entities + EmailLog
  migrations/  seed.ts
tests/
  unit/                        Vitest + fast-check (rules + DB-backed services)
  e2e/                         Playwright browser tests
docs/ARCHITECTURE.md           field-level data model + routes
data/massrecruit_mock_data.csv denormalized seed dataset (20 MA universities)
```

## Rules
- New business logic → a function in `lib/services.ts`, with its invariants in
  `tests/unit/services.test.ts`; pure helpers → `lib/rules.ts` + `rules.test.ts`.
- New page → a Server Component under `app/…`; interactive bits → a sibling
  `"use client"` component that posts to a server action.
- Never import `lib/services.ts` or `lib/db.ts` from a client component.

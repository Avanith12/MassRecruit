# Design — MassRecruit recruitment lifecycle

## Layering
```
UI (Server Components)  ──renders──▶  data from lib/services.ts
   │ forms                                   ▲
   ▼ server actions (app/actions.ts) ────────┘ ServiceError → form error
lib/services.ts  ── pure helpers ──▶  lib/rules.ts   (no I/O, fully testable)
   │ Prisma
   ▼
PostgreSQL (embedded locally · managed in production)
```

## Data model (8 entities + EmailLog)
`School 1─* Department`, `School 1─* User`, `User(researcher) 1─* Study`,
`Study 1─1 ConsentForm`, `Study 1─* AvailabilitySlot`, `User(participant) 1─* Application`,
`Study 1─* Application`, `Application 1─1 Booking`, `AvailabilitySlot 1─1 Booking`.
Field-level definitions: `docs/ARCHITECTURE.md`.

## Key design decisions
- **Verified-researcher gate as a reusable `where`** (`publicStudyWhere`) applied to every
  public query, so R1.4/R6.1 can't be forgotten in a new query path.
- **School search in JS, not SQL** — load schools once, match names/aliases at word
  boundaries (so "MIT" ⊄ "Smith"); OR the resulting school IDs into the Prisma filter.
  Each query token must match some field, enabling "sleep umass".
- **Concurrency via compare-and-set** — `bookSlot`, `decideApplication`, and
  `sendDueReminders` each claim their row with a guarded `updateMany` inside a
  transaction, so parallel requests can't double-apply. Covered by property tests that
  fire many concurrent attempts.
- **Time zones** — slots are stored in UTC; wall-clock input is converted from
  America/New_York with a two-pass DST-aware offset. The reminder "tomorrow" test uses
  calendar-day comparison in the app time zone.
- **Consent versioning** — `updateStudy` bumps `ConsentForm.version` whenever text or the
  PDF URL changes; `applyToStudy` snapshots the version onto the Application.

## Error handling
`ServiceError` = expected, user-facing (shown in the form). Anything else propagates as a
500. `redirect()` throws by design and must not be swallowed by the try/catch wrapper.

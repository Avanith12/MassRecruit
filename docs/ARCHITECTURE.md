# MassRecruit — Architecture

Field-level reference for the data model and routes. For the *why* behind the design,
see `.kiro/specs/recruitment-lifecycle/design.md`.

## Stack
Next.js 15 (App Router) + TypeScript · React 19 Server Components & Server Actions ·
Prisma ORM · PostgreSQL (embedded locally, Neon / Vercel Postgres in prod) · Tailwind CSS ·
username+password auth (`bcryptjs`) with `jose` signed-cookie sessions · Resend email
(console + `EmailLog` fallback) · Vercel Blob consent-PDF storage (local `uploads/` in dev) ·
Vercel Cron for the daily reminder · Vitest + fast-check + Playwright for tests.

## Entity relationships
```
School 1─* Department
School 1─* User                 (researchers belong to a school/department)
User(researcher) 1─* Study
Study 1─1 ConsentForm
Study 1─* AvailabilitySlot
User(participant) 1─* Application
Study 1─* Application
Application 1─1 Booking
AvailabilitySlot 1─1 Booking
EmailLog                        (standalone audit log)
RateLimit                       (abuse protection counters)
```

## Tables (fields)

### School
`id` · `name` (unique) · `emailDomain` · `city` · `aliases` (comma-separated short names
for search, e.g. "UMass Boston, UMB").

### Department
`id` · `name` · `schoolId` → School. Unique on `(schoolId, name)`.

### User
`id` · `username` (unique) · `passwordHash` · `name` · `email` (unique) ·
`role` (`STUDENT` | `RESEARCHER` | `ADMIN`) · `verified` (researchers need admin approval) ·
`phone?` · `schoolId?` · `departmentId?` · `failedLogins` · `lockedUntil?` ·
`emailVerifiedAt?` · `emailTokenHash?` (sha256 of the one-time link) · `emailTokenExpires?` ·
`sessionVersion` (bumped on sign-out to revoke sessions) · `createdAt`.

### Study
`id` · `nctId?` · `name` · `phase` (`EARLY_PHASE1|PHASE1..4|NA`) · `condition` · `city` ·
`status` (`RECRUITING|CLOSED`) · `irbId` · `compensationType` (`CASH|GIFT_CARD|OTHER`) ·
`compensationDetails` · `description` · `eligibility` · `minAge` · `researcherId` → User ·
`createdAt` · `updatedAt`. Indexed on `status` and `city`.

### ConsentForm
`id` · `studyId` (unique) → Study · `fileUrl?` (PDF) · `text` · `version` · `createdAt`.
Version increments whenever `text` or `fileUrl` changes.

### AvailabilitySlot
`id` · `studyId` → Study · `startTime` · `endTime` · `isBooked`. Indexed `(studyId, startTime)`.

### Application
`id` · `studyId` → Study · `participantId` → User · `name` · `email` · `dateOfBirth` ·
`consentSigned` · `consentSignedName` · `consentVersionSigned` · `consentSignedAt` ·
`status` (`PENDING|ACCEPTED|REJECTED`) · `submittedAt`. Unique on `(studyId, participantId)`.

### Booking
`id` · `slotId` (unique) → AvailabilitySlot · `applicationId` (unique) → Application ·
`reminderSentAt?` · `createdAt`.

### RateLimit
`key` (e.g. `login:<ip>`) · `count` · `windowStart` — fixed-window counters, updated atomically.

### EmailLog
`id` · `to` · `subject` · `text` · `status` (`SENT|DEV_LOGGED|FAILED`) · `error?` · `createdAt`.

## Routes
| Path | Who | Purpose |
|---|---|---|
| `/` | public | landing page (title, tagline, Continue →) |
| `/studies` | public | study cards + search/filter |
| `/verify-email` | public | confirm email from the one-time link |
| `/studies/[id]` | public | study detail; apply form when signed in as a student |
| `/login` `/register` | public | sign in (role choice) / `.edu` sign-up |
| `/student` | student | applications, statuses, slot booking |
| `/researcher` | researcher | dashboard |
| `/researcher/studies/new` | verified researcher | create study |
| `/researcher/studies/[id]` | owner | applicants, slots, edit (+ consent PDF) |
| `/admin` | admin | verify/revoke researchers |
| `/admin/emails` | admin | email log |
| `/api/cron/reminders` | cron (Bearer `CRON_SECRET`) | daily reminders |
| `/api/files/consent/[name]` | public | serves locally-stored consent PDFs (dev) |

## Business logic
Pure, testable rules in `lib/rules.ts`; all DB mutations in `lib/services.ts`. See the
spec in `.kiro/specs/recruitment-lifecycle/` for the acceptance criteria each enforces.

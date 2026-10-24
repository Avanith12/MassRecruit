# MassRecruit — Making Clinical Research More Accessible

**Hackachusetts Challenge Track: 01 — Healthcare & Biotech**

MassRecruit connects students and researchers across Massachusetts universities
(starting with UMass Boston). Students discover research studies, compare
compensation, understand how their data will be used, and sign up for studies with
scheduling. Researchers publish studies, manage participants, and send automatic
appointment reminders.

- **Repository:** https://github.com/Avanith12/MassRecruit
- **Demo video (< 3 min):** _[add link]_
- **Live demo:** _[add link after deploying — see [Deployment](#deployment)]_

---

## Team

| Name | Role |
|---|---|
| Jiehyun Kim | Developer |
| Ana Fahlboeck | Developer |
| Avanith Kanamarlapudi | Developer & Team Representative |

---

## Table of Contents
- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Seeding mock data](#seeding-mock-data)
- [Deployment](#deployment)
- [Security](#security)
- [Built with Kiro](#built-with-kiro)
- [Roadmap](#roadmap)
- [Privacy & data use](#privacy--data-use)
- [License](#license)

---

## Features

- **Browse studies (no login):** study cards show **name, compensation, and city**.
- **Search & filter:** by name / condition / city, plus phase and status.
- **Study detail pages:** description, simple eligibility, compensation, IRB ID, contact.
- **Username and password login:** accounts use a username (user ID) and password; sign-up is limited to `.edu` emails.
- **Apply to a study:** name, email, **date of birth** (age check), and **sign consent**
  (typed name + checkbox + timestamp, recording the consent version).
- **Researcher dashboard:** create/edit studies, define availability slots, review
  applicants, accept/reject.
- **Admin verification:** researchers must be approved by an admin before posting.
- **Scheduling:** accepted participants pick a researcher-defined time slot.
- **Automatic reminders:** a daily job emails participants one day before appointments.
- **Sign In :** there is one login button and then when u click it u can choose if u r a student or a researcher, studnets have the ability to register for the research lik participations and the researchers have the ability to add events or add project so that people can participate and then there is another admin view where the admin people will verify if the person is accepted researcher , if approved the reseracher can add the project make the sign in button in the top right corner
- **UI:** make it 2 pages 
- the first page must be simple white baground with a nice icon and some description about the whole project 
- the second page must be the data from the csv into clean boxes having study title , school name and compensation 
- check the csv file and make sure that the content matches 





> **Phase 2 (planned):** AI description simplification, AI student–study matching,
> QR-code recruitment flyers.

---

## How it works

```
PUBLIC (no login)
  Browse cards: [study name · compensation · city]  → search / filter
        │ click a card
        ▼
  Study detail page
        │ want to join → sign in (username + password)
        ▼
PARTICIPANT                              RESEARCHER (must be admin-verified)
  Apply: name, email, DOB,               Create/edit study, upload consent,
  sign consent (typed + checkbox)        define availability slots
        │                                       │
        └──────────────┬────────────────────────┘
                       ▼
  Researcher reviews → ACCEPT / REJECT  (acceptance email sent)
                       │ accepted
                       ▼
  Participant books an available slot
                       │
                       ▼
  Daily cron → emails a reminder one day before the appointment
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript, React 19 Server Components & Server Actions |
| Styling | Tailwind CSS — light theme + dark theme (black background, hot-pink text) |
| ORM | Prisma |
| Database | **PostgreSQL** everywhere — embedded Postgres locally (no Docker needed), Neon / Vercel Postgres / any managed Postgres in production |
| Auth | Username + password (bcrypt), signed `__Host-` session cookie (jose), email confirmation |
| Email | Resend (confirmation, acceptance, booking, reminders); console + admin email log in dev |
| Scheduled jobs | Vercel Cron (daily reminder) |
| File storage | Vercel Blob (consent PDFs); local `uploads/` folder in dev |
| Hosting | Vercel (or any Node host) |
| Tests | Vitest + fast-check (unit, property-based, DB integration) and Playwright (browser E2E) |

---

## Data model

Eight entities:

```
School 1─* Department
School 1─* User            (researchers belong to a school/department)
User(researcher) 1─* Study
Study 1─1 ConsentForm
Study 1─* AvailabilitySlot
User(participant) 1─* Application
Study 1─* Application
Application 1─1 Booking
AvailabilitySlot 1─1 Booking
```

Full field-level definitions are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Project structure

```
.
├── .kiro/                     # Kiro specs, steering, hooks (REQUIRED — do not gitignore)
├── app/
│   ├── page.tsx               # landing page (title, tagline, Continue →)
│   ├── studies/               # study cards + search/filter; [id]/ detail + apply/consent
│   ├── login/ register/       # single sign-in with role choice; .edu sign-up
│   ├── verify-email/          # email confirmation (one-time link)
│   ├── student/               # applications, status, slot booking
│   ├── researcher/            # dashboard, new study, manage study (applicants, slots, edit)
│   ├── admin/                 # researcher verification + email log
│   ├── api/cron/reminders/    # daily reminder job (Bearer CRON_SECRET)
│   ├── api/files/consent/     # serves locally stored consent PDFs (dev)
│   └── actions.ts             # server actions
├── components/                # ActionForm, ThemeToggle, UI primitives
├── lib/                       # rules.ts (pure rules) · services.ts (DB logic) · session · email · storage
├── middleware.ts              # per-request nonce Content-Security-Policy
├── prisma/                    # schema.prisma · migrations/ · seed.ts (CSV → tables + demo accounts)
├── scripts/                   # embedded Postgres for dev (dev-db.mjs) and tests (e2e-server.mjs)
├── tests/unit/  tests/e2e/
├── docs/ARCHITECTURE.md       # field-level data model + routes
├── data/massrecruit_mock_data.csv
├── SUBMISSION.md  LICENSE  README.md
```

---

## Getting started

### Prerequisites
- Node.js 20+ and npm. **No database install needed** — `npm run db:start` runs a real
  PostgreSQL server from npm (`embedded-postgres`).

### Install & run (local)

```bash
git clone https://github.com/Avanith12/MassRecruit.git
cd MassRecruit
npm install

cp .env.example .env
# edit .env: set AUTH_SECRET (openssl rand -hex 32) and CRON_SECRET

# Terminal 1 — local Postgres on port 5433 (leave running; data kept in .pgdata/)
npm run db:start

# Terminal 2 — schema, mock data, app
npx prisma migrate deploy
npm run db:seed
npm run dev            # http://localhost:3000
```

### Demo accounts (local seed)

On the sign-in page pick the matching role. Locally the password is `password123`;
on a hosted database you must choose your own (see [Deployment](#deployment)).

| Username | Role | Notes |
|---|---|---|
| `student` | Student | apply, sign consent, book slots |
| `researcher` | Researcher (verified) | owns 2 demo studies with open slots |
| `pending` | Researcher (unverified) | sees "awaiting verification" until an admin approves |
| `admin` | Admin | approve/revoke researchers, view the email log |

The ~400 CSV mock users get random passwords and can't sign in. New sign-ups must click
the confirmation link; without `RESEND_API_KEY` the link is printed in the server console
and shown to admins at `/admin/emails`.

### Tests

```bash
npm test            # 88 Vitest tests (unit + property-based + Postgres integration)
npm run test:e2e    # 18 Playwright browser tests against a production build
npm run typecheck
```

Both suites start their own throwaway Postgres (ports 5434 / 5435), so they never touch
your dev data. E2E uses the system Chrome; for Playwright's bundled Chromium run
`npx playwright install chromium` and set `PW_CHANNEL=""`.

---

## Environment variables

Copy `.env.example` to `.env` (gitignored — never commit secrets). Key settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (`?sslmode=require` in production) |
| `AUTH_SECRET` | ≥ 32 random chars in production (`openssl rand -hex 32`) — the app refuses weak values |
| `CRON_SECRET` | Bearer token for `/api/cron/reminders` (Vercel Cron sends it automatically) |
| `ADMIN_EMAILS` | Comma-separated emails that become admins on sign-up (must still confirm the email) |
| `APP_URL` | Public URL used in email links, e.g. `https://massrecruit.vercel.app` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Real email delivery |
| `BLOB_READ_WRITE_TOKEN` | Consent-PDF storage (required on Vercel) |
| `ALLOWED_EMAIL_DOMAIN` | Defaults to `edu` |

---

## Seeding mock data

The repo ships with a generated mock dataset across **20 real Massachusetts
universities** (UMass Boston/Amherst/Lowell/Dartmouth, UMass Chan, Harvard, MIT, BU,
Northeastern, Tufts, BC, Brandeis, WPI, Clark, Smith, Amherst, Williams, Wellesley,
Holy Cross, Simmons).

```bash
# Regenerate the CSV (optional)
python3 scripts/generate_mock_csv.py
# → data/massrecruit_mock_data.csv  (200 study records, all 8 entities joined)
```

The CSV is **denormalized** (one row per study with related School, Department, User,
ConsentForm, a sample Application, AvailabilitySlot, and Booking) for easy viewing. The
Prisma seed splits it into the eight normalized tables.

---

## Deployment

Tested target: **Vercel + Neon Postgres** (Vercel's built-in Postgres is Neon). Any Node host
with a Postgres database works the same way (`npm run build && npm start`).

1. **Database:** create a Postgres database (Vercel dashboard → Storage → Neon, or
   [neon.tech](https://neon.tech)). Copy its connection string.
2. **Import the repo** into Vercel. The `vercel-build` script runs
   `prisma migrate deploy` before `next build`, so the schema is created/updated on every deploy.
3. **Environment variables** (Project → Settings → Environment Variables):
   `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`, `APP_URL`, and for full
   functionality `RESEND_API_KEY` + `EMAIL_FROM` (verify your sending domain in Resend) and
   `BLOB_READ_WRITE_TOKEN` (Storage → Blob).
4. **Load the demo data once** from your machine (this wipes the database):
   ```bash
   DATABASE_URL="<production url>" SEED_CONFIRM=yes SEED_PASSWORD="<12+ char secret>" npm run db:seed
   ```
   Share the demo usernames + that password with judges privately (submission form), not in the repo.
5. **Cron:** `vercel.json` schedules `/api/cron/reminders` daily; Vercel adds the
   `CRON_SECRET` bearer header automatically.

## Security

- **Auth:** bcrypt password hashes (8–72 bytes); `.edu`-only sign-up with **email
  confirmation** (single-use, hashed, 24 h tokens); role chosen at sign-in must match the
  account; admin powers need `ADMIN_EMAILS` **and** a confirmed email.
- **Sessions:** HttpOnly, Secure, SameSite=Lax `__Host-` cookie signed with HS256; sign-out
  revokes every issued token server-side (session version); role/verification changes apply
  immediately.
- **Brute force & abuse:** account lockout (5 failures → 15 min) plus Postgres-backed
  per-IP / per-user rate limits on sign-in, sign-up, applying, and email confirmation.
- **Access control:** every page and server action checks role and ownership; unverified
  researchers' studies are never public; applications always use the account email.
- **Injection & XSS:** Prisma parameterized queries (search input also strips `LIKE`
  wildcards); React output escaping; per-request **nonce-based CSP** with `strict-dynamic`.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `nosniff`,
  Referrer-Policy, Permissions-Policy; no `X-Powered-By`.
- **CSRF:** Next.js Server Actions reject cross-origin requests (verified); cron uses a
  constant-time bearer check.
- **Files:** consent uploads must be real PDFs ≤ 5 MB (magic-byte check), stored under
  random names, served with `nosniff` + sandbox CSP; path traversal blocked.
- **Data & secrets:** production refuses weak `AUTH_SECRET`; seeding a hosted DB requires a
  strong demo password; email logs mask one-time tokens once delivery is real;
  `npm audit` reports 0 vulnerabilities.

---

## Built with Kiro

This project was built using **Kiro**, and the `/.kiro` directory at the repo root
contains our specs, steering docs, and hooks.

> ⚠️ The `/.kiro` directory **must** be committed and **must not** be added to
> `.gitignore`, per the Hackachusetts rules.

- **Kiro surfaces used:** Kiro CLI — spec authoring, code generation, and the
  typecheck/test/build verify loop from the terminal. _[Add IDE / Web / Crew if used.]_
- **Spec-driven development:** the architecture and data model in
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) were authored as a spec before
  implementation, which kept features consistent and reduced rework versus ad-hoc
  prompting.
- **Agent hooks:** `.kiro/hooks/` defines typecheck + unit tests on save, migrate + reseed
  after a schema change, and the E2E suite before push.
- **Steering docs:** `.kiro/steering/` encodes the product rules (`.edu` only,
  admin-gated researchers, no double-booking), the stack, and where code goes.
- **MCP:** _[describe MCP servers if used; otherwise state it wasn't used]_
- **Property-based testing:** fast-check invariants in `tests/unit/` — no slot or
  application double-booked under random concurrent attempts; accepted ⇔ age ≥ minimum;
  exactly one reminder per appointment; `.edu`-only; DST-safe time zones; school-search
  matching (this one caught a real whitespace bug).
- **Kiro Powers:** _[list any Powers used; otherwise remove this line]_

A fuller write-up is in [`SUBMISSION.md`](SUBMISSION.md).

---

## Privacy & data use

- Collects the minimum PII: name, `.edu` email, and date of birth (no ID-image uploads
  in the MVP).
- Sign-up is restricted to `.edu` addresses; researchers are gated behind admin
  verification before they can post studies.
- A clear data-use notice is shown to participants.
- All mock data in this repo is **synthetic** — any resemblance to real people is
  coincidental.

---

## License

Released under the **MIT License** — see [`LICENSE`](LICENSE). This lets judges freely
test, run, and evaluate the project.

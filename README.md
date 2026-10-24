# MassRecruit — Making Clinical Research More Accessible

**Hackachusetts Challenge Track: 01 — Healthcare & Biotech**

MassRecruit connects students and researchers across Massachusetts universities
(starting with UMass Boston). Students discover research studies, compare
compensation, understand how their data will be used, and sign up for studies with
scheduling. Researchers publish studies, manage participants, and send automatic
appointment reminders.

- **Repository:** https://github.com/Avanith12/MassRecruit
- **Demo video (< 3 min):** _[add link]_
- **Live demo:** _[add link]_

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
- **Sign In :** there is one login button and then when u click it u can choose if u r a student or a researcher, studnets have the ability to register for the research lik participations and the researchers have the ability to add events or add project so that people can participate and then there is another admin view where the admin people will verify if the person is accepted researcher , if approved the reseracher can add the project 


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
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + HTML/CSS |
| ORM | Prisma |
| Database (dev) | SQLite |
| Database (prod) | Turso (libSQL) or Vercel Postgres — swappable via Prisma |
| Auth | Username (user ID) and password |
| Email | Resend (acceptance, reminders) |
| Scheduled jobs | Vercel Cron (daily) |
| File storage | Vercel Blob (consent PDFs) |
| Hosting | Vercel |

> **Note:** SQLite cannot persist on Vercel's serverless filesystem, so production uses
> Turso or Vercel Postgres. Prisma lets us develop on SQLite and switch with a single
> connection-string change.

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
├── docs/
│   └── ARCHITECTURE.md        # architecture, data model, routes, roadmap
├── data/
│   └── massrecruit_mock_data.csv   # generated mock dataset (20 MA universities)
├── scripts/
│   └── generate_mock_csv.py   # mock-data generator
├── SUBMISSION.md              # hackathon submission write-up
└── README.md
```

> _As the Next.js app is implemented, `app/`, `prisma/`, `lib/`, and `components/`
> directories will be added._

---

## Getting started

### Prerequisites
- Node.js 18+ (20+ recommended)
- npm (or pnpm/yarn)
- Python 3.11+ (only needed to regenerate mock data)

### Install & run (local)

```bash
# 1. Clone
git clone https://github.com/Avanith12/MassRecruit.git
cd MassRecruit

# 2. Install dependencies
npm install

# 3. Configure environment (see below)
cp .env.example .env.local   # then edit values

# 4. Set up the database (SQLite locally)
npx prisma migrate dev
npx prisma db seed

# 5. Start the dev server
npm run dev
# open http://localhost:3000
```

> The exact commands finalize as the app scaffolding lands; `docs/ARCHITECTURE.md`
> tracks the current build state.

---

## Environment variables

Create `.env.local` (never commit secrets):

```bash
# Database (local dev uses SQLite)
DATABASE_URL="file:./dev.db"

# Production example (Turso)
# DATABASE_URL="libsql://<your-db>.turso.io"
# DATABASE_AUTH_TOKEN="<token>"

# Email (Resend)
RESEND_API_KEY="..."
EMAIL_FROM="MassRecruit <noreply@yourdomain.edu>"

# Auth (username + password)
AUTH_SECRET="..."              # random string for session signing
ALLOWED_EMAIL_DOMAIN="edu"     # restrict sign-ups to .edu

# Admin bootstrap
ADMIN_EMAILS="you@umb.edu"     # comma-separated admin accounts

# Cron protection
CRON_SECRET="..."              # verifies requests to the reminders endpoint

# File storage (Phase 1b)
BLOB_READ_WRITE_TOKEN="..."
```

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

1. Push to GitHub and import the repo into **Vercel**.
2. Provision a production database (**Turso** or **Vercel Postgres**) and set
   `DATABASE_URL` (and auth token).
3. Add all environment variables in the Vercel dashboard.
4. Configure **Vercel Cron** to call the reminders endpoint once per day.
5. Verify your **Resend** sending domain for reliable email delivery.

---

## Built with Kiro

This project was built using **Kiro**, and the `/.kiro` directory at the repo root
contains our specs, steering docs, and hooks.

> ⚠️ The `/.kiro` directory **must** be committed and **must not** be added to
> `.gitignore`, per the Hackachusetts rules.

- **Kiro surfaces used:** _[IDE / CLI / Web / Crew — list what you used]_
- **Spec-driven development:** the architecture and data model in
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) were authored as a spec before
  implementation, which kept features consistent and reduced rework versus ad-hoc
  prompting.
- **Agent hooks:** _[workflows you automated — e.g., lint/test on save, regenerate seed]_
- **Steering docs:** _[how steering encoded stack choices and rules like "researchers
  gated behind admin verification"]_
- **MCP:** _[servers/tools connected and what they enabled]_
- **Property-based testing:** _[invariants tested — e.g., no double-booked slot, age
  eligibility, consent-version recording]_
- **Kiro Powers:** _[e.g., github-cli, playwright/agent-browser]_

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

_[Choose a license — e.g., MIT — and add a LICENSE file. Required so judges can test
and evaluate freely.]_

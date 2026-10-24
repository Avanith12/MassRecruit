# Hackachusetts Submission — MassRecruit

> **Formatting note:** This document is structured for pasting into a Google Doc.
> Each numbered section maps to a submission requirement. Replace every `[[ ... ]]`
> placeholder with your final value before submitting.

---

## Challenge Track

**01 — Healthcare & Biotech**

## Project Title

**MassRecruit — Making Clinical Research More Accessible**

## Tagline

Connecting students and researchers across Massachusetts universities so research
participation is discoverable, transparent, and easy to sign up for.

## Team

| Name | Role | Email |
|---|---|---|
| Jiehyun Kim | Team member | [[email]] |
| Ana Fahlboeck | Team member | [[email]] |
| Avanith Kanamarlapudi | **Representative** (authorized to submit on behalf of the team) | [[email]] |

> Maximum 4 members per team. One Representative is appointed and authorized to
> enter the Submission on the team's behalf.

## Links

| Item | Link |
|---|---|
| GitHub repository (public) | https://github.com/Avanith12/MassRecruit |
| Demonstration video (< 3 min, public) | [[YouTube/Vimeo/Facebook/Youku URL]] |
| Live demo / test build | [[deployed URL]] |
| Test credentials (if access is gated) | [[participant login / researcher login / admin login]] |

---

## 1. Inspiration

Clinical and academic research depends on recruiting participants, yet students who
*want* to take part often can't find studies, can't tell how much they'll be
compensated, and don't understand how their data will be used. Researchers, in turn,
rely on paper flyers and scattered email lists. MassRecruit is a single, clean platform
that connects students with research opportunities across Massachusetts universities —
starting with UMass Boston — making participation accessible and transparent for
students and recruitment simpler for researchers.

## 2. What it does

MassRecruit supports the full recruitment lifecycle:

- **Browse (no login):** Studies appear as simple cards showing **study name,
  compensation, and location (city)**. A search box (name / condition / city) plus
  filters (phase, status) help students find relevant opportunities.
- **Study details:** Clicking a card opens a detail page with description, simple
  eligibility, compensation, IRB ID, and researcher contact.
- **Apply:** A signed-in student submits interest with **name, email, date of birth
  (age check)**, and **signs the consent form** (typed name + checkbox + timestamp,
  recording the exact consent version agreed to).
- **Researcher review:** The researcher receives the application and **accepts or
  rejects** it. On acceptance, the student is emailed automatically.
- **Scheduling:** Accepted students **pick a time slot** the researcher has defined
  (Calendly-style).
- **Reminders:** A daily scheduled job sends a **reminder email one day before** the
  appointment.
- **Trust & access control:** `.edu`-only sign-up; researchers must be **approved by an
  admin** before they can post studies; the "Register/Edit Study" action is hidden
  until a researcher is verified.

**Phase 2 (planned):** AI study-description simplification, AI student–study matching,
and QR-code recruitment flyers.

## 3. How we built it

- **Framework:** Next.js (App Router) + TypeScript — public pages, researcher
  dashboard, admin, and API routes in one deployable codebase.
- **Styling:** Tailwind CSS + HTML/CSS for a clean, simple UI.
- **Data layer:** Prisma ORM with a schema covering **School, Department, User, Study,
  ConsentForm, Application, AvailabilitySlot, Booking**.
- **Database:** SQLite for local development (seeded from a mock dataset spanning 20 real
  Massachusetts universities); production database (Turso or Vercel Postgres) selected at
  deploy time — Prisma makes the switch a one-line change.
- **Auth:** Username (user ID) and password. Sign-up stays limited to `.edu` emails.
- **Email:** Resend for acceptance emails and reminders.
- **Scheduling:** Vercel Cron (daily) drives the day-before reminder.
- **Hosting:** Vercel.
- **Seed data:** A Python generator produced a consistent mock dataset (valid foreign
  keys across all entities) representing studies, researchers, departments, applications,
  slots, and bookings across Massachusetts schools.

## 4. Challenges we ran into

- **SQLite on Vercel:** SQLite can't persist on Vercel's ephemeral, read-only serverless
  filesystem. We solved this by developing on SQLite locally while keeping the production
  database swappable via Prisma (Turso / Vercel Postgres).
- **Representing 8 related entities as one shareable dataset:** flattening a relational
  model into a single CSV for review required a careful denormalized layout with
  consistent IDs.
- **Privacy-sensitive data:** we deliberately scoped the MVP to collect a **date of
  birth** rather than uploaded ID images, and surfaced a clear data-use notice.

## 5. Accomplishments we're proud of

- A complete, documented architecture and data model before writing feature code.
- An end-to-end flow — discover → apply → consent → accept → schedule → remind — designed
  around real student and researcher needs.
- A realistic, internally consistent mock dataset spanning 20 Massachusetts universities.

## 6. What we learned

- How to design for serverless constraints from day one (storage, cron, email).
- How spec-driven planning in Kiro reduces rework compared to ad-hoc "vibe coding."
- How to balance accessibility and privacy when handling student PII in a research context.

## 7. What's next for MassRecruit

- Ship Phase 2: AI description simplification, AI matching, QR-code flyers.
- Expand beyond UMass Boston to additional Massachusetts institutions.
- Add calendar (.ics / Google Calendar) integration and optional university SSO.

---

## 8. How we used Kiro (required write-up)

> Judges must understand how effectively Kiro was used. Fill in each subsection with the
> specifics from your build. Placeholders mark where to add concrete detail/screenshots.

### 8.1 Which Kiro tools did you use?
- **Kiro [[IDE / CLI / Web / Crew — list what you used]].**
- [[Briefly describe what each surface was used for and how they differed. Example:
  "Used Kiro Web for planning and spec authoring; Kiro IDE for implementing and iterating
  on the Next.js app." Note which you found best for which task.]]

### 8.2 Spec-driven development
- **How we structured the spec:** We authored a detailed architecture/spec document
  (`docs/ARCHITECTURE.md`) capturing goals, the agreed stack, the full data model
  (School → Department → User → Study → ConsentForm → Application → AvailabilitySlot →
  Booking), page/route map, and a phased build order **before** implementation.
- **How it improved the process:** [[Describe how having the spec let Kiro implement
  features consistently and reduced back-and-forth.]]
- **Vs. vibe coding:** [[Contrast the spec-driven flow with unplanned prompting — e.g.,
  fewer wrong assumptions, clearer acceptance criteria.]]

### 8.3 Agent hooks
- **Workflows automated:** [[e.g., run tests/linting on save, regenerate seed data on CSV
  change, format on commit.]]
- **Impact:** [[How the hooks improved speed/quality.]]

### 8.4 Steering docs
- **How we leveraged steering:** [[e.g., steering files encoding our stack choices,
  naming conventions, and "researcher gated behind admin verification" rules so Kiro's
  output stayed consistent.]]
- **Biggest-impact strategy:** [[The one steering practice that helped most.]]

### 8.5 MCP (Model Context Protocol)
- **How extending Kiro helped:** [[Which MCP servers/tools you connected and what they
  enabled — e.g., DB inspection, web search for library docs — that would otherwise have
  been hard.]]

### 8.6 Property-based testing (PBT)
- **What PBT caught:** [[Issues found beyond unit tests.]]
- **Requirements covered:** [[e.g., age eligibility logic, slot-booking invariants such
  as "a booked slot cannot be double-booked," consent-version recording.]]

### 8.7 Kiro Powers
- **Powers leveraged:** [[e.g., github-cli for PRs, playwright/agent-browser for UI
  checks.]]
- **Third-party tooling via Powers:** [[Anything you used that you wouldn't have
  otherwise.]]

---

## 9. Submission checklist (verify before submitting)

- [ ] Team members listed (max 4); Representative identified
- [ ] Built with Kiro; Kiro usage write-up complete (section 8)
- [ ] Challenge track identified (Healthcare & Biotech)
- [ ] Text description of features/functionality included
- [ ] Demo video < 3 min, public, shows the Project functioning; link added
- [ ] Video contains no unlicensed third-party trademarks/music
- [ ] Public GitHub repo URL provided with all source, assets, and run instructions
- [ ] `/.kiro` directory present at repo root and **not** in `.gitignore`
- [ ] Working project accessible for testing (URL/demo/build; credentials if private)
- [ ] All materials in English (or English translations provided)
- [ ] Submission is original work, solely owned, no IP violations
- [ ] No disqualifying financial/preferential support from Sponsor/Administrator

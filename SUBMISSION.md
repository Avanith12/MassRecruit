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
| Test credentials | usernames `student` · `researcher` · `admin` · `pending` (unverified researcher); password = the `SEED_PASSWORD` used when seeding the live database — **enter it in the private submission form, not in the public repo** |

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
- **Styling:** Tailwind CSS — a light theme and a toggleable dark theme (black background,
  hot-pink text) saved per browser and applied before first paint (no flash).
- **Pages:** a landing page (big title, tagline, Continue →) leading to the studies page
  with search, filters, and the CSV-seeded study cards.
- **Data layer:** Prisma ORM with a schema covering **School, Department, User, Study,
  ConsentForm, Application, AvailabilitySlot, Booking**.
- **Database:** PostgreSQL everywhere. Locally an embedded Postgres server runs straight
  from npm (no Docker); tests spin up their own throwaway instances; production uses a
  managed Postgres (Neon / Vercel Postgres) with `prisma migrate deploy` on every build.
- **Auth:** Username (user ID) and password (bcrypt), `.edu`-only sign-up with emailed
  one-time confirmation links, signed `__Host-` session cookies revoked on sign-out,
  account lockout and Postgres-backed rate limiting.
- **Security:** nonce-based Content-Security-Policy, HSTS, anti-framing headers,
  role/ownership checks in every server action, validated PDF uploads, 0 `npm audit` findings.
- **Email:** Resend for confirmation, acceptance, booking, and reminder emails; an admin
  email log shows every message.
- **Scheduling:** Vercel Cron (daily) drives the day-before reminder.
- **Hosting:** Vercel.
- **Seed data:** A Python generator produced a consistent mock dataset (valid foreign
  keys across all entities) representing studies, researchers, departments, applications,
  slots, and bookings across Massachusetts schools.

## 4. Challenges we ran into

- **A database that works the same locally and in production:** SQLite can't persist on
  Vercel's serverless filesystem, and installing Postgres is a barrier for teammates and
  judges. We moved to Postgres everywhere and run a real embedded Postgres from npm locally,
  so dev, tests, and production share one engine. Switching surfaced a real bug: Postgres
  `LIKE` is case-sensitive, which would have broken school search in production.
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
- **Kiro CLI** was our primary surface. We drove the entire build from the terminal:
  authoring the spec and steering docs, generating the Next.js app, running the
  typecheck/test/build verify loop, and iterating on failures — all in one agent session.
- The CLI's ability to run commands and read their output made the test/verify loop tight:
  every feature was followed by `npm run typecheck && npm test && npm run build` and, for
  UI work, `npm run test:e2e`, with the agent reading results and fixing issues before moving on.
- _[If the team also used Kiro IDE / Web / Crew, add which tasks each was best for.]_

### 8.2 Spec-driven development
- **How we structured the spec:** We authored a detailed architecture/spec document
  (`docs/ARCHITECTURE.md`) capturing goals, the agreed stack, the full data model
  (School → Department → User → Study → ConsentForm → Application → AvailabilitySlot →
  Booking), page/route map, and a phased build order **before** implementation.
  The spec lives in `.kiro/specs/recruitment-lifecycle/` (`requirements.md` with
  EARS-style acceptance criteria → `design.md` → a checked-off `tasks.md`), with the
  field-level model in `docs/ARCHITECTURE.md`.
- **How it improved the process:** each requirement (e.g. R3.2 "accept iff age ≥ minimum",
  R4.3 "no double-booking") became both a service function and a test, so Kiro implemented
  against concrete criteria instead of guesses. Numbering requirements let tasks cite the
  requirement they satisfy, keeping the build traceable.
- **Vs. vibe coding:** writing the data model and the booking/consent/reminder rules down
  first avoided rework — the concurrency approach (compare-and-set) and consent-versioning
  were decided in `design.md` before code, rather than discovered mid-implementation.

### 8.3 Agent hooks
- **Workflows automated** (see `.kiro/hooks/`):
  - `verify-on-save` — typecheck + fast unit/property tests when a `lib/` or test file
    (or the Prisma schema) is saved, so rule regressions surface immediately.
  - `reseed-on-schema-change` — `prisma generate && migrate dev && db seed` after a
    schema edit, keeping the running app in sync with the model.
  - `e2e-before-push` — the Playwright suite against a production build before pushing.
- **Impact:** the save-time hook caught type and rule regressions within seconds instead
  of at build time; the reseed hook removed a manual three-command step after every
  schema change.

### 8.4 Steering docs
- **How we leveraged steering** (`.kiro/steering/`): `product.md` encoded the
  non-negotiable rules (`.edu`-only, admin-gated researchers, no double-booking, one
  reminder per appointment, minimum PII); `tech.md` pinned the stack, the
  "pure rules in `rules.ts` / DB logic in `services.ts`" split, and the compare-and-set
  concurrency pattern; `structure.md` said where new code goes.
- **Biggest-impact strategy:** putting the hard product rules *and* the testability
  convention (pure `rules.ts`) in steering meant new logic arrived already split into a
  pure, property-testable helper plus a thin service — which is exactly what made the
  property tests below possible.

### 8.5 MCP (Model Context Protocol)
- _[If the team connected any MCP servers/tools (e.g. a database or docs server),
  describe them and what they enabled here. If MCP was not used for this project, state
  that explicitly so judges aren't left guessing.]_

### 8.6 Property-based testing (PBT)
- **What PBT caught:** a fast-check invariant ("a school always matches a search for its
  own name") surfaced a real bug — a school name containing doubled whitespace failed to
  match because only the query, not the stored name, was whitespace-normalized. A plain
  unit test with tidy fixtures would have missed it.
- **Requirements covered** (`tests/unit/`): no slot or application is ever double-booked
  under random concurrent booking attempts (R4.3); an application is accepted ⇔ age ≥ the
  study minimum (R3.2); every appointment gets exactly one reminder day under a daily cron
  (R5.2); `.edu` filtering rejects all other domains (R2.1); Boston time-zone conversion
  round-trips across DST; the CSV parser round-trips arbitrary fields; school search never
  throws and respects word boundaries (R1.3). 88 Vitest tests and 18 Playwright browser
  tests pass, all against real PostgreSQL.

### 8.7 Kiro Powers
- _[List any Kiro Powers the team used (e.g. github-cli for PRs). If none were used,
  remove this subsection rather than leaving placeholders.]_

---

## 9. Submission checklist (verify before submitting)

- [ ] Team members listed (max 4); Representative identified — **add member emails (section Team)**
- [x] Built with Kiro; Kiro usage write-up complete (section 8)
- [x] Challenge track identified (Healthcare & Biotech)
- [x] Text description of features/functionality included (README + sections 2–3)
- [ ] Demo video < 3 min, public, shows the Project functioning; link added — **record & link**
- [ ] Video contains no unlicensed third-party trademarks/music
- [x] Public GitHub repo URL provided with all source, assets, and run instructions
- [x] `/.kiro` directory present at repo root and **not** in `.gitignore`
- [ ] Working project accessible for testing — **deploy and add the live URL** (credentials above)
- [x] All materials in English
- [x] Submission is original work, solely owned, no IP violations (MIT LICENSE; synthetic data)
- [x] No disqualifying financial/preferential support from Sponsor/Administrator

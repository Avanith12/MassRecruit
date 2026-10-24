# Requirements — MassRecruit recruitment lifecycle

Written as a spec *before* implementation so Kiro could build against acceptance
criteria rather than ad-hoc prompts. Uses EARS-style "shall" statements.

## R1 — Public discovery
- R1.1 The system shall let any visitor browse studies without logging in.
- R1.2 Each study card shall display the study name, compensation, and city.
- R1.3 The system shall let visitors search by study name, condition, city, department,
  or school (full name, short name/alias, or email domain) and combine terms
  (e.g. "sleep umass"), and filter by school, phase, and status.
- R1.4 Only studies owned by a currently-verified researcher shall be publicly visible.
- R1.5 A study detail page shall show description, eligibility, compensation, IRB ID,
  researcher contact, and a plain-language data-use notice.

## R2 — Accounts & access
- R2.1 Sign-up shall be restricted to `.edu` email addresses.
- R2.2 Accounts shall use a username + password; the sign-in screen requires choosing a
  role, and authentication shall fail if the account's role differs.
- R2.3 A researcher account shall start unverified and require admin approval before
  posting; admin accounts shall come only from `ADMIN_EMAILS`.
- R2.4 After 5 failed sign-ins the account shall be locked for 15 minutes.
- R2.5 New accounts shall confirm email ownership via a single-use link before applying;
  admin powers shall require a confirmed email.
- R2.6 Signing out shall invalidate the session token server-side.

## R3 — Applications & consent
- R3.1 A signed-in student shall apply with name, `.edu` email, and date of birth.
- R3.2 The system shall accept an application iff the applicant's age ≥ the study's
  minimum age on the submission date.
- R3.3 Consent shall require a typed signature matching the name, a checked box, and
  shall record the timestamp and the consent-form version signed.
- R3.4 A student shall not apply to the same study twice.

## R4 — Researcher review & scheduling
- R4.1 A verified researcher shall accept or reject each applicant exactly once; the
  participant shall be emailed on each decision.
- R4.2 A researcher shall define availability slots (future, non-overlapping, ≤ 8h).
- R4.3 An accepted student shall book exactly one available slot; a slot and an
  application shall each map to at most one booking even under concurrent attempts.
- R4.4 Editing a study's consent text or PDF shall create a new consent version.

## R5 — Reminders
- R5.1 A daily job, protected by `CRON_SECRET`, shall email each participant whose
  appointment is the next calendar day (America/New_York).
- R5.2 Each appointment shall receive exactly one reminder (idempotent across runs).

## R6 — Admin & observability
- R6.1 An admin shall verify or revoke researchers; revoking shall hide their studies.
- R6.2 Every email shall be recorded and viewable by admins at `/admin/emails`.

## R7 — Quality bar
- R7.0 A landing page shall show the title, a tagline, and a Continue button to the studies
  page; a theme toggle shall switch between light and dark (black + hot pink).
- R7.1 The UI shall be keyboard-accessible with labeled controls and visible focus.
- R7.2 Business rules shall be covered by unit, property-based, and E2E tests.

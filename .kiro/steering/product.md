# Product steering — MassRecruit

> Steering doc loaded into Kiro's context for every task. Encodes *what* we are
> building and the non-negotiable product rules, so generated code stays consistent.

## One-line pitch
Connect students and researchers across Massachusetts universities so research
participation is discoverable, transparent, and easy to sign up for.

**Challenge track:** 01 — Healthcare & Biotech.

## Users & roles
- **Visitor (no login):** browse and search studies, read detail pages.
- **Student:** apply to studies, sign consent, book an appointment slot.
- **Researcher:** post/edit studies, define slots, accept/reject applicants.
  Must be verified by an admin before any study is public.
- **Admin:** verify/revoke researchers; view the email log.

## Non-negotiable product rules (enforce in `lib/rules.ts` / `lib/services.ts`)
1. **`.edu` only** — sign-up and application emails must be `.edu` (or a subdomain).
2. **Researcher gating** — an unverified researcher cannot post, and their studies are
   never shown publicly. Revoking verification hides their studies immediately.
3. **Age check** — an application is accepted iff the applicant's age ≥ the study's
   minimum age on the submission date.
4. **Consent is explicit and versioned** — typed signature matching the name, a checked
   box, a timestamp, and the consent-form version are all recorded. Editing consent
   text/PDF creates a new version.
5. **No double-booking** — a slot and an application each map to at most one booking,
   even under concurrent attempts.
6. **One reminder per appointment** — a daily job emails each participant exactly once,
   the day before, in America/New_York time.
7. **Minimum PII** — name, `.edu` email, date of birth. No ID-image uploads in the MVP.
8. **Admins cannot self-register** — admin accounts come only from `ADMIN_EMAILS`.

## Accessibility & UX bar
- Every form control has a label; errors use `role="alert"`, success uses `role="status"`.
- Keyboard-navigable; visible focus rings; a skip-to-content link.
- Public study cards show exactly: **name, compensation, city**.

## Out of scope for the MVP (Phase 2)
AI description simplification, AI student–study matching, QR-code recruitment flyers.

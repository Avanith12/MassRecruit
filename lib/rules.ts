// Pure business rules. No DB / framework imports so they can be unit- and
// property-tested in isolation.

export const ROLES = ["STUDENT", "RESEARCHER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const PHASES = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"] as const;
export const STUDY_STATUSES = ["RECRUITING", "CLOSED"] as const;
export const COMPENSATION_TYPES = ["CASH", "GIFT_CARD", "OTHER"] as const;
export const APPLICATION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;

export const PHASE_LABELS: Record<string, string> = {
  EARLY_PHASE1: "Early Phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
  NA: "Not applicable",
};

export const APP_TIME_ZONE = "America/New_York";

export function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

// ---------- accounts ----------

const EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z0-9-]+$/i;

/** True if `email` is syntactically valid and its domain is `allowedTld` or a subdomain of it (e.g. "umb.edu"). */
export function isAllowedEmail(email: string, allowedTld = "edu"): boolean {
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return false;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  const tld = allowedTld.toLowerCase().replace(/^\./, "");
  return domain === tld || domain.endsWith("." + tld);
}

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function validateUsername(u: string): string | null {
  return USERNAME_RE.test(normalizeUsername(u))
    ? null
    : "Username must be 3–30 characters: letters, numbers, dot, dash or underscore.";
}

export function validatePassword(p: string): string | null {
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 128) return "Password must be at most 128 characters.";
  return null;
}

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ---------- eligibility ----------

/** Whole years between `dob` and `on`, computed on calendar dates (UTC). */
export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function meetsMinAge(dob: Date, minAge: number, on: Date): boolean {
  return ageOn(dob, on) >= minAge;
}

/** Extract minimum age from text like "Age 21+; non-smoker." Defaults to 18. */
export function parseMinAge(eligibility: string): number {
  const m = /age\s*(\d{1,2})\s*\+/i.exec(eligibility);
  return m ? Number(m[1]) : 18;
}

/** Parse a YYYY-MM-DD string into a UTC-midnight Date, rejecting impossible dates. */
export function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

// ---------- consent ----------

function normName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The typed signature must match the applicant's name (case/whitespace-insensitive). */
export function consentSignatureMatches(typed: string, name: string): boolean {
  const t = normName(typed);
  return t.length > 0 && t === normName(name);
}

// ---------- time zones ----------

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert a wall-clock string "YYYY-MM-DDTHH:mm" (or with a space, optional :ss)
 * in `timeZone` to a UTC Date. Returns null for malformed input.
 */
export function zonedWallTimeToUtc(wall: string, timeZone = APP_TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes handle DST transitions.
  let guess = naive - tzOffsetMs(new Date(naive), timeZone);
  guess = naive - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function zonedDateKey(instant: Date, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );
}

function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

// ---------- scheduling ----------

export const MAX_SLOT_MINUTES = 8 * 60;

export function validateSlot(start: Date, end: Date, now: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Invalid date/time.";
  if (start.getTime() <= now.getTime()) return "Slot must start in the future.";
  if (end.getTime() <= start.getTime()) return "Slot end must be after its start.";
  if (end.getTime() - start.getTime() > MAX_SLOT_MINUTES * 60_000) return "Slots can be at most 8 hours long.";
  return null;
}

/**
 * Reminder rule: send exactly when the appointment falls on the *next* calendar
 * day (in the app time zone) relative to `now`, and no reminder was sent yet.
 */
export function isDueForReminder(slotStart: Date, now: Date, reminderSentAt: Date | null): boolean {
  if (reminderSentAt) return false;
  if (slotStart.getTime() <= now.getTime()) return false;
  return zonedDateKey(slotStart) === addDaysToKey(zonedDateKey(now), 1);
}

/** UTC window that covers "tomorrow" in the app time zone, padded for DB pre-filtering. */
export function reminderQueryWindow(now: Date): { from: Date; to: Date } {
  return { from: now, to: new Date(now.getTime() + 50 * 3600_000) };
}

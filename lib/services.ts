// Domain services: all DB-mutating business logic lives here, independent of
// Next.js request APIs so it can be integration-tested directly.
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { appUrl, sendEmail } from "./email";
import { canStoreFiles, saveConsentPdf, validatePdf } from "./storage";
import {
  COMPENSATION_TYPES,
  PHASES,
  STUDY_STATUSES,
  consentSignatureMatches,
  formatDateTime,
  isAllowedEmail,
  isDueForReminder,
  isOneOf,
  meetsMinAge,
  normalizeQuery,
  normalizeUsername,
  parseAdminEmails,
  queryTokens,
  reminderQueryWindow,
  schoolMatchesTerm,
  validatePassword,
  validateSlot,
  validateUsername,
} from "./rules";

export class ServiceError extends Error {}

function fail(msg: string): never {
  throw new ServiceError(msg);
}

type Actor = { id: string; role: string; verified: boolean; emailVerifiedAt?: Date | null };

const BCRYPT_ROUNDS = 10;
// Used to keep login timing similar whether or not the username exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const allowedTld = () => process.env.ALLOWED_EMAIL_DOMAIN || "edu";

/** Studies visible to the public: posted by currently verified researchers. */
export const publicStudyWhere: Prisma.StudyWhereInput = { researcher: { role: "RESEARCHER", verified: true } };

// ---------------------------------------------------------------- accounts

export type RegisterInput = {
  role: string;
  username: string;
  password: string;
  name: string;
  email: string;
  schoolId?: string;
  departmentName?: string;
  phone?: string;
};

export async function registerUser(input: RegisterInput) {
  const username = normalizeUsername(input.username);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().replace(/\s+/g, " ");

  if (!isOneOf(["STUDENT", "RESEARCHER"] as const, input.role)) fail("Choose Student or Researcher.");
  const uErr = validateUsername(username);
  if (uErr) fail(uErr);
  const pErr = validatePassword(input.password);
  if (pErr) fail(pErr);
  if (name.length < 2 || name.length > 100) fail("Please enter your full name.");
  if (!isAllowedEmail(email, allowedTld())) fail(`Sign-up is limited to .${allowedTld()} email addresses.`);

  const phone = input.phone?.trim() || null;
  if (phone && !/^[0-9()+\-.\s]{7,25}$/.test(phone)) fail("Please enter a valid phone number.");

  // Check duplicates before creating anything (e.g. a department row).
  const existing = await db.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing) fail(existing.username === username ? "That username is taken." : "An account with that email already exists.");

  const isAdmin = parseAdminEmails(process.env.ADMIN_EMAILS).includes(email);
  const role = isAdmin ? "ADMIN" : input.role;

  let schoolId: string | null = null;
  let departmentId: string | null = null;
  if (role === "RESEARCHER") {
    if (!input.schoolId) fail("Researchers must select a school.");
    const school = await db.school.findUnique({ where: { id: input.schoolId } });
    if (!school) fail("Unknown school.");
    schoolId = school!.id;
    const dept = (input.departmentName ?? "").trim();
    if (dept.length < 2 || dept.length > 100) fail("Researchers must enter a department.");
    departmentId = (
      await db.department.upsert({
        where: { schoolId_name: { schoolId: school!.id, name: dept } },
        update: {},
        create: { schoolId: school!.id, name: dept },
      })
    ).id;
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await db.user.create({
      data: {
        username,
        passwordHash,
        name,
        email,
        role,
        verified: role === "ADMIN", // students don't need it; researchers wait for an admin
        phone,
        schoolId,
        departmentId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") fail("Username or email already in use.");
    throw e;
  }
  await sendVerificationEmail(user.id);
  return user;
}

// ---------------------------------------------------------------- email verification

export const EMAIL_TOKEN_HOURS = 24;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Issue a fresh one-time token (only its hash is stored) and email the link. */
export async function sendVerificationEmail(userId: string, now = new Date()) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) fail("Account not found.");
  if (u!.emailVerifiedAt) return;
  const token = randomBytes(32).toString("base64url");
  await db.user.update({
    where: { id: u!.id },
    data: { emailTokenHash: sha256(token), emailTokenExpires: new Date(now.getTime() + EMAIL_TOKEN_HOURS * 3600_000) },
  });
  await sendEmail({
    to: u!.email,
    subject: "Confirm your MassRecruit email",
    text: `Hi ${u!.name},\n\nConfirm that this is your email address to finish setting up your account:\n${appUrl(`/verify-email?token=${token}`)}\n\nThis link expires in ${EMAIL_TOKEN_HOURS} hours. If you didn't sign up, ignore this email.\n\n— MassRecruit`,
    redact: [token],
  });
}

/** Consume a verification token. Single-use; expired or unknown tokens are rejected. */
export async function verifyEmailToken(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) fail("This verification link is invalid.");
  const hash = sha256(token);
  const u = await db.user.findUnique({ where: { emailTokenHash: hash } });
  if (!u || !u.emailTokenExpires || u.emailTokenExpires <= now) fail("This verification link is invalid or has expired. Request a new one.");
  // Compare-and-set on the hash so the token can only be used once.
  const { count } = await db.user.updateMany({
    where: { id: u!.id, emailTokenHash: hash },
    data: { emailVerifiedAt: now, emailTokenHash: null, emailTokenExpires: null },
  });
  if (count === 0) fail("This verification link has already been used.");
  return u!;
}

function assertEmailVerified(actor: { emailVerifiedAt?: Date | null }) {
  if (!actor.emailVerifiedAt) fail("Please confirm your email address first (check your inbox for the link).");
}

/** Verify credentials and that the account matches the role chosen on the sign-in screen. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export async function authenticate(usernameRaw: string, password: string, chosenRole: string, now = new Date()) {
  const username = normalizeUsername(usernameRaw);
  const user = await db.user.findUnique({ where: { username } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (user?.lockedUntil && user.lockedUntil > now) {
    fail(`Too many failed sign-in attempts. Try again in ${Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000)} minute(s).`);
  }
  if (user && !ok) {
    // Atomic increment so parallel guesses all count.
    const { failedLogins } = await db.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } } });
    if (failedLogins >= MAX_FAILED_LOGINS) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) },
      });
    }
  }
  if (!user || !ok) fail("Invalid username or password.");
  if (user!.failedLogins > 0 || user!.lockedUntil) {
    await db.user.update({ where: { id: user!.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
  if (user!.role !== chosenRole) {
    const label = user!.role.charAt(0) + user!.role.slice(1).toLowerCase();
    fail(`This account is registered as ${label === "Admin" ? "an" : "a"} ${label}. Choose "${label}" to sign in.`);
  }
  return user!;
}

// ---------------------------------------------------------------- rate limiting

/**
 * Fixed-window rate limit stored in Postgres (works across serverless instances).
 * Returns true if the action is allowed, false once `limit` is exceeded in the window.
 */
export async function consumeRateLimit(key: string, limit: number, windowMs: number, now = new Date()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  // Single atomic upsert: reset the counter when a new window starts, else increment.
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, ${windowStart})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" = EXCLUDED."windowStart" THEN "RateLimit"."count" + 1 ELSE 1 END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING "count"`;
  return Number(rows[0].count) <= limit;
}

export const LIMITS = {
  login: { limit: 20, windowMs: 15 * 60_000 }, // per IP
  register: { limit: 10, windowMs: 60 * 60_000 }, // per IP
  apply: { limit: 30, windowMs: 60 * 60_000 }, // per user
  verify: { limit: 30, windowMs: 15 * 60_000 }, // per IP
  resend: { limit: 3, windowMs: 60 * 60_000 }, // per user
} as const;

export async function enforceRateLimit(kind: keyof typeof LIMITS, id: string, now = new Date()) {
  const { limit, windowMs } = LIMITS[kind];
  if (!(await consumeRateLimit(`${kind}:${id}`, limit, windowMs, now))) fail("Too many attempts. Please wait a few minutes and try again.");
}

// ---------------------------------------------------------------- studies

export type StudyFilters = { q?: string; phase?: string; status?: string; school?: string; page?: number };

export const PAGE_SIZE = 24;

/**
 * Word-start match on a text column (case-insensitive ILIKE): the value starts with `t`
 * or contains " t", "-t", "(t". Word-start avoids "mit" ⊂ "Smith".
 */
const wordStart = (t: string): Prisma.StringFilter[] =>
  [{ startsWith: t }, { contains: ` ${t}` }, { contains: `-${t}` }, { contains: `(${t}` }].map((f) => ({ ...f, mode: "insensitive" as const }));

/** Text columns searched directly for a term. */
const textMatch = (t: string): Prisma.StudyWhereInput[] =>
  wordStart(t).flatMap((f) => [
    { name: f },
    { condition: f },
    { city: f },
    { researcher: { department: { name: f } } },
  ]);

/**
 * Builds the search filter. Schools are matched in JS (word-start on name/aliases, or
 * exact email domain) so "UMass Boston", "MIT", "umb.edu" and full names all work.
 * If the whole query names a school, return that school's studies (plus text hits);
 * otherwise every token must match some field, e.g. "sleep umass".
 */
async function searchWhere(qRaw: string): Promise<Prisma.StudyWhereInput | null> {
  const q = normalizeQuery(qRaw);
  if (!q) return null;
  const schools = await db.school.findMany({ select: { id: true, name: true, aliases: true, emailDomain: true } });
  const schoolIds = (term: string) => schools.filter((s) => schoolMatchesTerm(s, term)).map((s) => s.id);
  const bySchool = (ids: string[]): Prisma.StudyWhereInput[] => (ids.length ? [{ researcher: { schoolId: { in: ids } } }] : []);

  const phraseIds = schoolIds(q);
  if (phraseIds.length) return { OR: [...textMatch(q), ...bySchool(phraseIds)] };
  return { AND: queryTokens(q).map((t) => ({ OR: [...textMatch(t), ...bySchool(schoolIds(t))] })) };
}

export async function searchStudies(f: StudyFilters, take = PAGE_SIZE) {
  const and: Prisma.StudyWhereInput[] = [publicStudyWhere];
  const text = await searchWhere(f.q ?? "");
  if (text) and.push(text);
  if (isOneOf(PHASES, f.phase)) and.push({ phase: f.phase });
  if (isOneOf(STUDY_STATUSES, f.status)) and.push({ status: f.status });
  if (f.school) and.push({ researcher: { schoolId: f.school } });
  const where: Prisma.StudyWhereInput = { AND: and };

  const total = await db.study.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / take));
  // Clamp so an out-of-range ?page= shows the last page instead of an empty list.
  const page = Math.min(Number.isInteger(f.page) && f.page! > 0 ? f.page! : 1, pageCount);
  const studies = await db.study.findMany({
    where,
    orderBy: [{ status: "desc" }, { createdAt: "desc" }, { id: "asc" }], // RECRUITING before CLOSED; stable paging
    take,
    skip: (page - 1) * take,
    select: {
      id: true, name: true, city: true, compensationDetails: true, compensationType: true, status: true, phase: true, condition: true,
      researcher: { select: { school: { select: { name: true } } } },
    },
  });
  return { studies, total, page, pageCount };
}

export type StudyInput = {
  name: string;
  condition: string;
  city: string;
  phase: string;
  status: string;
  irbId: string;
  compensationType: string;
  compensationDetails: string;
  description: string;
  eligibility: string;
  minAge: string | number;
  consentText: string;
  /** Optional new consent PDF (raw bytes). */
  consentPdf?: Uint8Array | null;
  /** Remove the current consent PDF (ignored if a new one is uploaded). */
  removeConsentPdf?: boolean;
};

function cleanStudyInput(i: StudyInput) {
  const t = (s: string) => (s ?? "").trim();
  const data = {
    name: t(i.name),
    condition: t(i.condition),
    city: t(i.city),
    phase: t(i.phase),
    status: t(i.status),
    irbId: t(i.irbId),
    compensationType: t(i.compensationType),
    compensationDetails: t(i.compensationDetails),
    description: t(i.description),
    eligibility: t(i.eligibility),
    minAge: Number(i.minAge),
  };
  if (data.name.length < 3 || data.name.length > 200) fail("Study name must be 3–200 characters.");
  const tooLong = (v: string, max: number) => v.length > max;
  if (!data.condition || tooLong(data.condition, 100)) fail("Condition is required (max 100 characters).");
  if (!data.city || tooLong(data.city, 100)) fail("City is required (max 100 characters).");
  if (tooLong(data.irbId, 50) || tooLong(data.compensationDetails, 100) || tooLong(data.eligibility, 500) || tooLong(data.description, 5000))
    fail("One of the fields is too long.");
  if (!isOneOf(PHASES, data.phase)) fail("Invalid phase.");
  if (!isOneOf(STUDY_STATUSES, data.status)) fail("Invalid status.");
  if (!data.irbId) fail("IRB ID is required.");
  if (!isOneOf(COMPENSATION_TYPES, data.compensationType)) fail("Invalid compensation type.");
  if (!data.compensationDetails) fail("Compensation details are required.");
  if (data.description.length < 10) fail("Description must be at least 10 characters.");
  if (!data.eligibility) fail("Eligibility is required.");
  if (!Number.isInteger(data.minAge) || data.minAge < 18 || data.minAge > 99) fail("Minimum age must be 18–99.");
  const consentText = t(i.consentText);
  if (consentText.length < 20) fail("Consent form text must be at least 20 characters.");
  if (consentText.length > 20_000) fail("Consent form text is too long.");
  const pdf = i.consentPdf && i.consentPdf.length > 0 ? i.consentPdf : null;
  if (pdf) {
    const err = validatePdf(pdf);
    if (err) fail(err);
    if (!canStoreFiles()) fail("PDF uploads aren't configured on this server (set BLOB_READ_WRITE_TOKEN).");
  }
  return { data, consentText, pdf, removePdf: !pdf && !!i.removeConsentPdf };
}

function assertVerifiedResearcher(actor: Actor) {
  if (actor.role !== "RESEARCHER") fail("Only researchers can manage studies.");
  if (!actor.verified) fail("Your researcher account is awaiting admin verification.");
}

export async function createStudy(actor: Actor, input: StudyInput) {
  assertVerifiedResearcher(actor);
  const { data, consentText, pdf } = cleanStudyInput(input);
  const fileUrl = pdf ? await saveConsentPdf(pdf) : null;
  return db.study.create({
    data: { ...data, researcherId: actor.id, consentForm: { create: { text: consentText, fileUrl, version: 1 } } },
  });
}

export async function getOwnStudy(actor: Actor, studyId: string) {
  assertVerifiedResearcher(actor);
  const study = await db.study.findUnique({ where: { id: studyId }, include: { consentForm: true } });
  if (!study || study.researcherId !== actor.id) fail("Study not found.");
  return study!;
}

/**
 * Updates a study. Changing the consent text or PDF bumps the consent version so
 * each signature records exactly what was agreed to.
 */
export async function updateStudy(actor: Actor, studyId: string, input: StudyInput) {
  const study = await getOwnStudy(actor, studyId);
  const { data, consentText, pdf, removePdf } = cleanStudyInput(input);
  const cfOld = study.consentForm;
  const fileUrl = pdf ? await saveConsentPdf(pdf) : removePdf ? null : (cfOld?.fileUrl ?? null);
  return db.$transaction(async (tx) => {
    const updated = await tx.study.update({ where: { id: study.id }, data });
    const cf = cfOld;
    if (!cf) await tx.consentForm.create({ data: { studyId: study.id, text: consentText, fileUrl, version: 1 } });
    else if (cf.text !== consentText || cf.fileUrl !== fileUrl)
      await tx.consentForm.update({ where: { id: cf.id }, data: { text: consentText, fileUrl, version: cf.version + 1 } });
    return updated;
  });
}

export async function addSlot(actor: Actor, studyId: string, start: Date | null, end: Date | null, now = new Date()) {
  const study = await getOwnStudy(actor, studyId);
  if (!start || !end) fail("Enter a valid start and end time.");
  const err = validateSlot(start!, end!, now);
  if (err) fail(err);
  const overlap = await db.availabilitySlot.findFirst({
    where: { studyId: study.id, startTime: { lt: end! }, endTime: { gt: start! } },
  });
  if (overlap) fail("This slot overlaps an existing slot.");
  return db.availabilitySlot.create({ data: { studyId: study.id, startTime: start!, endTime: end! } });
}

export async function deleteSlot(actor: Actor, slotId: string) {
  const slot = await db.availabilitySlot.findUnique({ where: { id: slotId }, include: { study: true } });
  if (!slot || slot.study.researcherId !== actor.id) fail("Slot not found.");
  assertVerifiedResearcher(actor);
  // Atomic: only delete if still unbooked.
  const { count } = await db.availabilitySlot.deleteMany({ where: { id: slotId, isBooked: false } });
  if (count === 0) fail("Booked slots can't be deleted.");
}

// ---------------------------------------------------------------- applications

export type ApplyInput = {
  name: string;
  dateOfBirth: Date | null;
  consentChecked: boolean;
  signedName: string;
};

export async function applyToStudy(actor: Actor, studyId: string, input: ApplyInput, now = new Date()) {
  if (actor.role !== "STUDENT") fail("Only student accounts can apply to studies.");
  const study = await db.study.findFirst({ where: { id: studyId, ...publicStudyWhere }, include: { consentForm: true } });
  if (!study) fail("Study not found.");
  if (study!.status !== "RECRUITING") fail("This study is not currently recruiting.");
  if (!study!.consentForm) fail("This study has no consent form yet.");

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) fail("Please enter your full name.");
  // Contact email is always the verified account email, so applications can't be used
  // to send MassRecruit emails to arbitrary addresses.
  const account = await db.user.findUnique({ where: { id: actor.id }, select: { email: true, emailVerifiedAt: true } });
  if (!account) fail("Account not found.");
  assertEmailVerified(account!);
  const email = account!.email;
  if (!input.dateOfBirth || input.dateOfBirth.getTime() > now.getTime()) fail("Please enter a valid date of birth.");
  if (!meetsMinAge(input.dateOfBirth!, study!.minAge, now)) fail(`You must be at least ${study!.minAge} to join this study.`);
  if (!input.consentChecked) fail("You must check the consent box.");
  if (!consentSignatureMatches(input.signedName, name)) fail("Your typed signature must match your full name.");

  try {
    return await db.application.create({
      data: {
        studyId: study!.id,
        participantId: actor.id,
        name,
        email,
        dateOfBirth: input.dateOfBirth!,
        consentSigned: true,
        consentSignedName: input.signedName.trim().replace(/\s+/g, " "),
        consentVersionSigned: study!.consentForm!.version,
        consentSignedAt: now,
        submittedAt: now,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") fail("You've already applied to this study.");
    throw e;
  }
}

export async function decideApplication(actor: Actor, applicationId: string, decision: string) {
  assertVerifiedResearcher(actor);
  if (decision !== "ACCEPTED" && decision !== "REJECTED") fail("Invalid decision.");
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { study: true } });
  if (!app || app.study.researcherId !== actor.id) fail("Application not found.");
  // Compare-and-set so concurrent decisions can't both apply.
  const { count } = await db.application.updateMany({ where: { id: app!.id, status: "PENDING" }, data: { status: decision } });
  if (count === 0) fail("This application has already been decided.");

  if (decision === "ACCEPTED") {
    await sendEmail({
      to: app!.email,
      subject: `You're accepted: ${app!.study.name}`,
      text: `Hi ${app!.name},\n\nGood news — you've been accepted to "${app!.study.name}".\nPick a time slot here: ${appUrl("/student")}\n\n— MassRecruit`,
    });
  } else {
    await sendEmail({
      to: app!.email,
      subject: `Update on your application: ${app!.study.name}`,
      text: `Hi ${app!.name},\n\nThank you for your interest in "${app!.study.name}". Unfortunately you were not selected this time.\n\n— MassRecruit`,
    });
  }
}

// ---------------------------------------------------------------- scheduling

export async function bookSlot(actor: Actor, applicationId: string, slotId: string, now = new Date()) {
  if (actor.role !== "STUDENT") fail("Only students can book slots.");
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { booking: true, study: { include: { researcher: { select: { verified: true } } } } },
  });
  if (!app || app.participantId !== actor.id) fail("Application not found.");
  if (!app!.study.researcher.verified) fail("This study is no longer available for booking.");
  if (app!.status !== "ACCEPTED") fail("You can book a slot only after being accepted.");
  if (app!.booking) fail("You already booked a slot for this study.");
  const slot = await db.availabilitySlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.studyId !== app!.studyId) fail("Slot not found.");
  if (slot!.startTime.getTime() <= now.getTime()) fail("That slot is in the past.");

  try {
    const booking = await db.$transaction(async (tx) => {
      // Claim the slot atomically; fails if someone else got it first.
      const { count } = await tx.availabilitySlot.updateMany({ where: { id: slot!.id, isBooked: false }, data: { isBooked: true } });
      if (count === 0) fail("Sorry, that slot was just taken. Please choose another.");
      return tx.booking.create({ data: { slotId: slot!.id, applicationId: app!.id, createdAt: now } });
    });
    await sendEmail({
      to: app!.email,
      subject: `Appointment confirmed: ${app!.study.name}`,
      text: `Hi ${app!.name},\n\nYour appointment for "${app!.study.name}" is booked for ${formatDateTime(slot!.startTime)}.\nYou'll get a reminder the day before.\n\n— MassRecruit`,
    });
    return booking;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") fail("This slot or application is already booked.");
    throw e;
  }
}

/** Daily job: email participants whose appointment is tomorrow. Idempotent via reminderSentAt. */
export async function sendDueReminders(now = new Date()) {
  const { from, to } = reminderQueryWindow(now);
  const candidates = await db.booking.findMany({
    where: { reminderSentAt: null, slot: { startTime: { gt: from, lte: to } } },
    include: { slot: true, application: { include: { study: { include: { researcher: true } } } } },
  });
  let sent = 0;
  let failed = 0;
  for (const b of candidates) {
    if (!isDueForReminder(b.slot.startTime, now, b.reminderSentAt)) continue;
    // Claim first so concurrent cron runs never double-send.
    const { count } = await db.booking.updateMany({ where: { id: b.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (count === 0) continue;
    const { application: a } = b;
    const r = await sendEmail({
      to: a.email,
      subject: `Reminder: ${a.study.name} tomorrow`,
      text: `Hi ${a.name},\n\nThis is a reminder of your appointment for "${a.study.name}" on ${formatDateTime(b.slot.startTime)} in ${a.study.city}.\nQuestions? Contact ${a.study.researcher.name} at ${a.study.researcher.email}.\n\n— MassRecruit`,
    });
    if (r.ok) sent++;
    else {
      failed++;
      await db.booking.update({ where: { id: b.id }, data: { reminderSentAt: null } }); // retry next run
    }
  }
  return { checked: candidates.length, sent, failed };
}

// ---------------------------------------------------------------- admin

export async function setResearcherVerified(actor: Actor, userId: string, verified: boolean) {
  if (actor.role !== "ADMIN") fail("Admins only.");
  assertEmailVerified(actor); // ADMIN_EMAILS bootstrap only counts once the address is proven
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== "RESEARCHER") fail("Researcher not found.");
  if (verified && !u!.emailVerifiedAt) fail("This researcher hasn't confirmed their email address yet.");
  await db.user.update({ where: { id: userId }, data: { verified } });
  if (verified && !u!.verified) {
    await sendEmail({
      to: u!.email,
      subject: "Your MassRecruit researcher account is approved",
      text: `Hi ${u!.name},\n\nAn admin verified your researcher account. You can now post studies: ${appUrl("/researcher")}\n\n— MassRecruit`,
    });
  }
}

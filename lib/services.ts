// Domain services: all DB-mutating business logic lives here, independent of
// Next.js request APIs so it can be integration-tested directly.
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { appUrl, sendEmail } from "./email";
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
  normalizeUsername,
  parseAdminEmails,
  reminderQueryWindow,
  validatePassword,
  validateSlot,
  validateUsername,
} from "./rules";

export class ServiceError extends Error {}

function fail(msg: string): never {
  throw new ServiceError(msg);
}

type Actor = { id: string; role: string; verified: boolean };

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

  const existing = await db.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing) fail(existing.username === username ? "That username is taken." : "An account with that email already exists.");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    return await db.user.create({
      data: {
        username,
        passwordHash,
        name,
        email,
        role,
        verified: role === "ADMIN", // students don't need it; researchers wait for an admin
        phone: input.phone?.trim() || null,
        schoolId,
        departmentId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") fail("Username or email already in use.");
    throw e;
  }
}

/** Verify credentials and that the account matches the role chosen on the sign-in screen. */
export async function authenticate(usernameRaw: string, password: string, chosenRole: string) {
  const username = normalizeUsername(usernameRaw);
  const user = await db.user.findUnique({ where: { username } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) fail("Invalid username or password.");
  if (user!.role !== chosenRole) {
    const label = user!.role.charAt(0) + user!.role.slice(1).toLowerCase();
    fail(`This account is registered as ${label === "Admin" ? "an" : "a"} ${label}. Choose "${label}" to sign in.`);
  }
  return user!;
}

// ---------------------------------------------------------------- studies

export type StudyFilters = { q?: string; phase?: string; status?: string; page?: number };

export const PAGE_SIZE = 24;

export async function searchStudies(f: StudyFilters, take = PAGE_SIZE) {
  const page = Number.isInteger(f.page) && f.page! > 0 ? f.page! : 1;
  const where: Prisma.StudyWhereInput = { ...publicStudyWhere };
  const q = f.q?.trim();
  if (q) where.OR = [{ name: { contains: q } }, { condition: { contains: q } }, { city: { contains: q } }];
  if (isOneOf(PHASES, f.phase)) where.phase = f.phase;
  if (isOneOf(STUDY_STATUSES, f.status)) where.status = f.status;
  const [studies, total] = await Promise.all([
    db.study.findMany({
      where,
      orderBy: [{ status: "desc" }, { createdAt: "desc" }], // RECRUITING before CLOSED
      take,
      skip: (page - 1) * take,
      select: { id: true, name: true, city: true, compensationDetails: true, compensationType: true, status: true, phase: true, condition: true },
    }),
    db.study.count({ where }),
  ]);
  return { studies, total, page, pageCount: Math.max(1, Math.ceil(total / take)) };
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
  if (!data.condition) fail("Condition is required.");
  if (!data.city) fail("City is required.");
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
  return { data, consentText };
}

function assertVerifiedResearcher(actor: Actor) {
  if (actor.role !== "RESEARCHER") fail("Only researchers can manage studies.");
  if (!actor.verified) fail("Your researcher account is awaiting admin verification.");
}

export async function createStudy(actor: Actor, input: StudyInput) {
  assertVerifiedResearcher(actor);
  const { data, consentText } = cleanStudyInput(input);
  return db.study.create({
    data: { ...data, researcherId: actor.id, consentForm: { create: { text: consentText, version: 1 } } },
  });
}

export async function getOwnStudy(actor: Actor, studyId: string) {
  assertVerifiedResearcher(actor);
  const study = await db.study.findUnique({ where: { id: studyId }, include: { consentForm: true } });
  if (!study || study.researcherId !== actor.id) fail("Study not found.");
  return study!;
}

/** Updates a study. Changing the consent text bumps its version so signatures record what was agreed to. */
export async function updateStudy(actor: Actor, studyId: string, input: StudyInput) {
  const study = await getOwnStudy(actor, studyId);
  const { data, consentText } = cleanStudyInput(input);
  return db.$transaction(async (tx) => {
    const updated = await tx.study.update({ where: { id: study.id }, data });
    const cf = study.consentForm;
    if (!cf) await tx.consentForm.create({ data: { studyId: study.id, text: consentText, version: 1 } });
    else if (cf.text !== consentText)
      await tx.consentForm.update({ where: { id: cf.id }, data: { text: consentText, version: cf.version + 1 } });
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
  email: string;
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
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) fail("Please enter your full name.");
  if (!isAllowedEmail(email, allowedTld())) fail(`Please use your .${allowedTld()} email address.`);
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
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { booking: true, study: true } });
  if (!app || app.participantId !== actor.id) fail("Application not found.");
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
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== "RESEARCHER") fail("Researcher not found.");
  await db.user.update({ where: { id: userId }, data: { verified } });
  if (verified && !u!.verified) {
    await sendEmail({
      to: u!.email,
      subject: "Your MassRecruit researcher account is approved",
      text: `Hi ${u!.name},\n\nAn admin verified your researcher account. You can now post studies: ${appUrl("/researcher")}\n\n— MassRecruit`,
    });
  }
}

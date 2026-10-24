/* Seeds the eight normalized tables from data/massrecruit_mock_data.csv and adds
 * demo accounts. Idempotent: wipes existing rows first.
 *
 * All seeded accounts use the password in SEED_PASSWORD (default "password123").
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { parseCsvObjects } from "../lib/csv";
import { PHASES, isOneOf, parseMinAge, zonedWallTimeToUtc } from "../lib/rules";

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || "password123";

const at = (s: string) => {
  const d = s ? zonedWallTimeToUtc(s) : null;
  if (s && !d) throw new Error(`Bad datetime in CSV: ${s}`);
  return d;
};
const dateOnly = (s: string) => new Date(`${s}T00:00:00Z`);

const consentText = (studyName: string, school: string) =>
  `You are invited to take part in "${studyName}" conducted at ${school}. ` +
  `Participation is voluntary and you may withdraw at any time without penalty. ` +
  `We will collect your name, email, and date of birth to confirm eligibility and contact you. ` +
  `Your data will be stored securely, used only for this study, and reported in de-identified form.`;

/** Return a value unique within `seen`, appending -2, -3… if needed. */
function uniq(seen: Set<string>, base: string, join = "-"): string {
  let v = base;
  for (let n = 2; seen.has(v); n++) v = `${base}${join}${n}`;
  seen.add(v);
  return v;
}
const uniqEmail = (seen: Set<string>, email: string) => {
  const [local, domain] = email.toLowerCase().split("@");
  let v = email.toLowerCase();
  for (let n = 2; seen.has(v); n++) v = `${local}+${n}@${domain}`;
  seen.add(v);
  return v;
};

async function main() {
  const rows = parseCsvObjects(readFileSync(join(__dirname, "..", "data", "massrecruit_mock_data.csv"), "utf8"));
  console.log(`Parsed ${rows.length} CSV rows`);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Wipe in FK order.
  await db.booking.deleteMany();
  await db.application.deleteMany();
  await db.availabilitySlot.deleteMany();
  await db.consentForm.deleteMany();
  await db.study.deleteMany();
  await db.user.deleteMany();
  await db.department.deleteMany();
  await db.school.deleteMany();

  const schoolIds = new Map<string, string>();
  const deptIds = new Map<string, string>();
  const userIds = new Map<string, string>(); // CSV user id -> db id
  const usernames = new Set<string>();
  const emails = new Set<string>();

  for (const r of rows) {
    if (!schoolIds.has(r.school_id)) {
      const s = await db.school.create({ data: { name: r.school_name, emailDomain: r.school_email_domain, city: r.school_city } });
      schoolIds.set(r.school_id, s.id);
    }
    if (!deptIds.has(r.department_id)) {
      const d = await db.department.upsert({
        where: { schoolId_name: { schoolId: schoolIds.get(r.school_id)!, name: r.department_name } },
        update: {},
        create: { name: r.department_name, schoolId: schoolIds.get(r.school_id)! },
      });
      deptIds.set(r.department_id, d.id);
    }
  }

  // Demo accounts first so they get clean usernames.
  const umb = await db.school.findFirst({ where: { name: "University of Massachusetts Boston" } });
  if (!umb) throw new Error("UMass Boston missing from CSV");
  const umbDept = await db.department.upsert({
    where: { schoolId_name: { schoolId: umb.id, name: "Psychology" } },
    update: {},
    create: { schoolId: umb.id, name: "Psychology" },
  });
  const demo = async (username: string, name: string, email: string, role: string, verified: boolean, withSchool = false) => {
    usernames.add(username);
    emails.add(email);
    return db.user.create({
      data: {
        username, name, email, role, verified, passwordHash,
        ...(withSchool ? { schoolId: umb.id, departmentId: umbDept.id, phone: "(617) 555-0100" } : {}),
      },
    });
  };
  const admin = await demo("admin", "Site Admin", "admin@umb.edu", "ADMIN", true);
  const student = await demo("student", "Jordan Student", "jordan.student@umb.edu", "STUDENT", false);
  const researcher = await demo("researcher", "Dr. Riley Chen", "riley.chen@umb.edu", "RESEARCHER", true, true);
  await demo("pending", "Dr. Pat Pending", "pat.pending@umb.edu", "RESEARCHER", false, true);

  let studies = 0, apps = 0, slots = 0, bookings = 0;
  for (const r of rows) {
    // Researcher
    let researcherId = userIds.get(r.researcher_user_id);
    if (!researcherId) {
      const u = await db.user.create({
        data: {
          username: uniq(usernames, r.researcher_email.split("@")[0].toLowerCase()),
          email: uniqEmail(emails, r.researcher_email),
          name: r.researcher_name,
          role: "RESEARCHER",
          verified: r.researcher_verified === "true",
          phone: r.researcher_phone || null,
          passwordHash,
          schoolId: schoolIds.get(r.school_id),
          departmentId: deptIds.get(r.department_id),
        },
      });
      researcherId = u.id;
      userIds.set(r.researcher_user_id, u.id);
    }

    const study = await db.study.create({
      data: {
        nctId: r.nct_id || null,
        name: r.study_name,
        phase: isOneOf(PHASES, r.phase) ? r.phase : "NA",
        condition: r.condition,
        city: r.mass_city,
        status: r.status === "CLOSED" ? "CLOSED" : "RECRUITING",
        irbId: r.irb_id,
        compensationType: r.compensation_type,
        compensationDetails: r.compensation_details,
        description: r.description,
        eligibility: r.eligibility,
        minAge: parseMinAge(r.eligibility),
        researcherId,
        createdAt: at(r.study_created_at)!,
        consentForm: {
          create: {
            fileUrl: r.consent_file_url || null,
            version: Number(r.consent_version) || 1,
            text: consentText(r.study_name, r.school_name),
            createdAt: at(r.consent_created_at) ?? undefined,
          },
        },
      },
    });
    studies++;

    let slotId: string | null = null;
    if (r.slot_id) {
      const s = await db.availabilitySlot.create({
        data: { studyId: study.id, startTime: at(r.slot_start_time)!, endTime: at(r.slot_end_time)!, isBooked: r.slot_is_booked === "true" && !!r.booking_id },
      });
      slotId = s.id;
      slots++;
    }

    if (r.application_id) {
      let participantId = userIds.get(r.participant_user_id);
      if (!participantId) {
        const u = await db.user.create({
          data: {
            username: uniq(usernames, r.participant_email.split("@")[0].toLowerCase()),
            email: uniqEmail(emails, r.participant_email),
            name: r.participant_name,
            role: "STUDENT",
            passwordHash,
          },
        });
        participantId = u.id;
        userIds.set(r.participant_user_id, u.id);
      }
      const app = await db.application.create({
        data: {
          studyId: study.id,
          participantId,
          name: r.participant_name,
          email: r.participant_email.toLowerCase(),
          dateOfBirth: dateOnly(r.participant_date_of_birth),
          consentSigned: r.consent_signed === "true",
          consentSignedName: r.consent_signed_name,
          consentVersionSigned: Number(r.consent_form_version_signed) || 1,
          consentSignedAt: at(r.consent_signed_at)!,
          status: r.application_status,
          submittedAt: at(r.application_submitted_at)!,
        },
      });
      apps++;
      if (r.booking_id && slotId && r.application_status === "ACCEPTED") {
        await db.booking.create({
          data: { slotId, applicationId: app.id, reminderSentAt: at(r.reminder_sent_at), createdAt: at(r.booking_created_at) ?? undefined },
        });
        bookings++;
      }
    }
  }

  // Demo researcher: two studies with open future slots so the full flow is testable.
  const day = 24 * 3600_000;
  const now = Date.now();
  for (const [i, s] of [
    { name: "Sleep Habits and Memory in College Students", condition: "Sleep", phase: "NA", comp: "GIFT_CARD", det: "$30 gift card", elig: "Age 18+; full-time student." },
    { name: "Mindfulness App for Exam Stress", condition: "Anxiety", phase: "EARLY_PHASE1", comp: "CASH", det: "$40 cash", elig: "Age 21+; English-speaking." },
  ].entries()) {
    const st = await db.study.create({
      data: {
        name: s.name, condition: s.condition, city: "Boston", phase: s.phase, status: "RECRUITING",
        irbId: `IRB-UMB-90${i}1`, compensationType: s.comp, compensationDetails: s.det,
        description: `The UMass Boston Psychology department is studying ${s.condition.toLowerCase()} in students. Participation involves a 60-minute session on campus.`,
        eligibility: s.elig, minAge: parseMinAge(s.elig), researcherId: researcher.id,
        consentForm: { create: { version: 1, text: consentText(s.name, "UMass Boston") } },
      },
    });
    for (let d = 2; d <= 6; d += 2) {
      const start = new Date(Math.ceil((now + d * day) / 3600_000) * 3600_000);
      await db.availabilitySlot.create({ data: { studyId: st.id, startTime: start, endTime: new Date(start.getTime() + 3600_000) } });
      slots++;
    }
    studies++;
  }

  console.log(
    `Seeded: ${schoolIds.size} schools, ${await db.department.count()} departments, ${await db.user.count()} users, ` +
      `${studies} studies, ${slots} slots, ${apps} applications, ${bookings} bookings`,
  );
  console.log(`Demo logins (password "${PASSWORD}"): admin / student / researcher (verified) / pending (unverified researcher)`);
  void admin; void student;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

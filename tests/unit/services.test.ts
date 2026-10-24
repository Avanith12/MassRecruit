import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { db } from "@/lib/db";
import { outbox } from "@/lib/email";
import * as svc from "@/lib/services";

const NOW = new Date("2026-10-24T14:00:00Z"); // Sat 10:00 EDT
const H = 3600_000;

async function wipe() {
  await db.rateLimit.deleteMany();
  await db.emailLog.deleteMany();
  await db.booking.deleteMany();
  await db.application.deleteMany();
  await db.availabilitySlot.deleteMany();
  await db.consentForm.deleteMany();
  await db.study.deleteMany();
  await db.user.deleteMany();
  await db.department.deleteMany();
  await db.school.deleteMany();
  outbox.length = 0;
}

let n = 0;
const uid = () => `u${Date.now().toString(36)}${n++}`;

async function school(o: { name?: string; aliases?: string; emailDomain?: string } = {}) {
  return db.school.create({ data: { name: o.name ?? `School ${uid()}`, emailDomain: o.emailDomain ?? "umb.edu", city: "Boston", aliases: o.aliases ?? "" } });
}
/** Simulate clicking the emailed link (tests that need the raw flow use verifyEmailToken). */
const confirmEmail = (id: string) => db.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });

async function student(name = "Jordan Student") {
  const u = await svc.registerUser({ role: "STUDENT", username: uid(), password: "password123", name, email: `${uid()}@umb.edu` });
  return confirmEmail(u.id);
}
async function researcher(verified = true, schoolId?: string) {
  const s = schoolId ? { id: schoolId } : await school();
  const r = await svc.registerUser({
    role: "RESEARCHER", username: uid(), password: "password123", name: "Dr. R", email: `${uid()}@umb.edu`,
    schoolId: s.id, departmentName: "Psychology",
  });
  return db.user.update({ where: { id: r.id }, data: { verified, emailVerifiedAt: new Date() } });
}
const studyInput = (o: Partial<svc.StudyInput> = {}): svc.StudyInput => ({
  name: "Sleep and Memory", condition: "Sleep", city: "Boston", phase: "NA", status: "RECRUITING", irbId: "IRB-1",
  compensationType: "CASH", compensationDetails: "$20 cash", description: "A study about sleep and memory.",
  eligibility: "Age 18+", minAge: 18, consentText: "I agree to participate in this research study voluntarily.", ...o,
});
const applyInput = (o: Partial<svc.ApplyInput> = {}): svc.ApplyInput => ({
  name: "Jordan Student", dateOfBirth: new Date("2000-01-01T00:00:00Z"),
  consentChecked: true, signedName: "jordan student", ...o,
});

/** Verified researcher + recruiting study + accepted student application + future slots. */
async function acceptedSetup(slotCount = 1) {
  const r = await researcher();
  const st = await svc.createStudy(r, studyInput());
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push(await svc.addSlot(r, st.id, new Date(NOW.getTime() + (24 + i * 2) * H), new Date(NOW.getTime() + (25 + i * 2) * H), NOW));
  }
  const s = await student();
  const app = await svc.applyToStudy(s, st.id, applyInput(), NOW);
  await svc.decideApplication(r, app.id, "ACCEPTED");
  return { r, st, slots, s, app };
}

const uploads = mkdtempSync(join(tmpdir(), "mr-uploads-"));
process.env.UPLOAD_DIR = uploads;

beforeEach(wipe);
afterAll(async () => {
  rmSync(uploads, { recursive: true, force: true });
  await wipe();
  await db.$disconnect();
});

describe("accounts", () => {
  it("registers .edu users, rejects other domains and duplicates", async () => {
    const u = await svc.registerUser({ role: "STUDENT", username: "Jordan", password: "password123", name: "J S", email: "J@UMB.edu" });
    expect(u.username).toBe("jordan");
    expect(u.email).toBe("j@umb.edu");
    expect(u.passwordHash).not.toContain("password123");
    await expect(svc.registerUser({ role: "STUDENT", username: "x1x", password: "password123", name: "J S", email: "j@gmail.com" })).rejects.toThrow(/\.edu/);
    await expect(svc.registerUser({ role: "STUDENT", username: "jordan", password: "password123", name: "J S", email: "k@umb.edu" })).rejects.toThrow(/taken/);
    await expect(svc.registerUser({ role: "STUDENT", username: "other", password: "password123", name: "J S", email: "j@umb.edu" })).rejects.toThrow(/email/);
  });

  it("cannot self-register as ADMIN; ADMIN_EMAILS bootstrap works", async () => {
    await expect(svc.registerUser({ role: "ADMIN", username: "evil", password: "password123", name: "E V", email: "e@umb.edu" })).rejects.toThrow();
    const boss = await svc.registerUser({ role: "STUDENT", username: "boss", password: "password123", name: "B O", email: "boss@umb.edu" });
    expect(boss.role).toBe("ADMIN");
  });

  it("new researchers start unverified and need a school", async () => {
    const r = await researcher(false);
    expect(r.verified).toBe(false);
    await expect(svc.registerUser({ role: "RESEARCHER", username: "nos", password: "password123", name: "N S", email: "n@umb.edu" })).rejects.toThrow(/school/);
  });

  it("authenticate checks password and the chosen role", async () => {
    const u = await student();
    await expect(svc.authenticate(u.username, "password123", "STUDENT")).resolves.toMatchObject({ id: u.id });
    await expect(svc.authenticate(u.username.toUpperCase(), "password123", "STUDENT")).resolves.toMatchObject({ id: u.id });
    await expect(svc.authenticate(u.username, "wrong-pass", "STUDENT")).rejects.toThrow(/Invalid/);
    await expect(svc.authenticate("nobody", "password123", "STUDENT")).rejects.toThrow(/Invalid/);
    await expect(svc.authenticate(u.username, "password123", "RESEARCHER")).rejects.toThrow(/registered as a Student/);
  });
});

describe("admin verification gate", () => {
  it("unverified researchers can't post; approval enables it and emails them", async () => {
    const r = await researcher(false);
    await expect(svc.createStudy(r, studyInput())).rejects.toThrow(/verification/);
    const admin = await confirmEmail(
      (await svc.registerUser({ role: "STUDENT", username: "boss", password: "password123", name: "B O", email: "boss@umb.edu" })).id,
    );
    const s = await student();
    await expect(svc.setResearcherVerified(s, r.id, true)).rejects.toThrow(/Admins/);
    await svc.setResearcherVerified(admin, r.id, true);
    const r2 = (await db.user.findUnique({ where: { id: r.id } }))!;
    expect(r2.verified).toBe(true);
    expect(outbox.at(-1)?.to).toBe(r.email);
    await expect(svc.createStudy(r2, studyInput())).resolves.toBeTruthy();
  });

  it("revoking verification hides studies from public search", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput({ name: "Unique Hidden Study" }));
    expect((await svc.searchStudies({ q: "Unique Hidden" })).total).toBe(1);
    await db.user.update({ where: { id: r.id }, data: { verified: false } });
    expect((await svc.searchStudies({ q: "Unique Hidden" })).total).toBe(0);
    const s = await student();
    await expect(svc.applyToStudy(s, st.id, applyInput(), NOW)).rejects.toThrow(/not found/);
  });
});

describe("studies & search", () => {
  it("filters by name, condition, city, phase, status", async () => {
    const r = await researcher();
    await svc.createStudy(r, studyInput({ name: "Alpha Migraine", condition: "Migraine", city: "Worcester", phase: "PHASE2" }));
    await svc.createStudy(r, studyInput({ name: "Beta Sleep", condition: "Sleep", city: "Boston", status: "CLOSED" }));
    expect((await svc.searchStudies({ q: "migraine" })).total).toBe(1);
    expect((await svc.searchStudies({ q: "Worcester" })).total).toBe(1);
    expect((await svc.searchStudies({ phase: "PHASE2" })).total).toBe(1);
    expect((await svc.searchStudies({ status: "CLOSED" })).studies[0].name).toBe("Beta Sleep");
    expect((await svc.searchStudies({ phase: "BOGUS" })).total).toBe(2); // invalid filter ignored
  });

  it("validates input and only the owner can edit", async () => {
    const r = await researcher();
    await expect(svc.createStudy(r, studyInput({ phase: "PHASE9" }))).rejects.toThrow(/phase/);
    await expect(svc.createStudy(r, studyInput({ minAge: 12 }))).rejects.toThrow(/age/);
    const st = await svc.createStudy(r, studyInput());
    const other = await researcher();
    await expect(svc.updateStudy(other, st.id, studyInput({ name: "Hijack" }))).rejects.toThrow(/not found/);
  });

  it("editing consent text bumps the version; applicants record the version they signed", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const s1 = await student();
    const a1 = await svc.applyToStudy(s1, st.id, applyInput(), NOW);
    expect(a1.consentVersionSigned).toBe(1);
    await svc.updateStudy(r, st.id, studyInput({ name: "Renamed" })); // same consent → no bump
    expect((await db.consentForm.findUnique({ where: { studyId: st.id } }))!.version).toBe(1);
    await svc.updateStudy(r, st.id, studyInput({ consentText: "Updated consent text with new data-use terms." }));
    expect((await db.consentForm.findUnique({ where: { studyId: st.id } }))!.version).toBe(2);
    const s2 = await student();
    const a2 = await svc.applyToStudy(s2, st.id, applyInput(), NOW);
    expect(a2.consentVersionSigned).toBe(2);
    expect((await db.application.findUnique({ where: { id: a1.id } }))!.consentVersionSigned).toBe(1);
  });
});

describe("applications", () => {
  it("uses the account email as the contact email (not a user-supplied one)", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const s = await student();
    const a = await svc.applyToStudy(s, st.id, { ...applyInput(), email: "victim@other.edu" } as svc.ApplyInput, NOW);
    expect(a.email).toBe(s.email);
  });

  it("records consent (typed name, checkbox, timestamp) and blocks duplicates", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const s = await student();
    const a = await svc.applyToStudy(s, st.id, applyInput(), NOW);
    expect(a).toMatchObject({ consentSigned: true, consentSignedName: "jordan student", status: "PENDING" });
    expect(a.consentSignedAt.toISOString()).toBe(NOW.toISOString());
    await expect(svc.applyToStudy(s, st.id, applyInput(), NOW)).rejects.toThrow(/already applied/);
  });

  it("enforces age, consent checkbox, signature, .edu email, recruiting status, student role", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput({ minAge: 21 }));
    const s = await student();
    await expect(svc.applyToStudy(s, st.id, applyInput({ dateOfBirth: new Date("2006-01-01T00:00:00Z") }), NOW)).rejects.toThrow(/at least 21/);
    await expect(svc.applyToStudy(s, st.id, applyInput({ consentChecked: false }), NOW)).rejects.toThrow(/consent box/);
    await expect(svc.applyToStudy(s, st.id, applyInput({ signedName: "Someone Else" }), NOW)).rejects.toThrow(/signature/);
    await expect(svc.applyToStudy(s, st.id, applyInput({ dateOfBirth: null }), NOW)).rejects.toThrow(/date of birth/);
    await expect(svc.applyToStudy(r, st.id, applyInput(), NOW)).rejects.toThrow(/student/i);
    const closed = await svc.createStudy(r, studyInput({ status: "CLOSED" }));
    await expect(svc.applyToStudy(s, closed.id, applyInput(), NOW)).rejects.toThrow(/not currently recruiting/);
    expect(await db.application.count()).toBe(0);
  });

  it("property: application accepted ⇔ age ≥ minAge on submission date", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput({ minAge: 21 }));
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 15 * 365, max: 30 * 365 }), async (daysOld) => {
        const s = await student();
        const dob = new Date(Date.UTC(2026, 9, 24) - daysOld * 86_400_000);
        const ok = await svc.applyToStudy(s, st.id, applyInput({ dateOfBirth: dob }), NOW).then(() => true, () => false);
        const age = 2026 - dob.getUTCFullYear() - (dob.getUTCMonth() > 9 || (dob.getUTCMonth() === 9 && dob.getUTCDate() > 24) ? 1 : 0);
        expect(ok).toBe(age >= 21);
      }),
      { numRuns: 40 },
    );
  });

  it("researcher accept/reject: owner only, once only, emails participant", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const s = await student();
    const a = await svc.applyToStudy(s, st.id, applyInput(), NOW);
    const other = await researcher();
    await expect(svc.decideApplication(other, a.id, "ACCEPTED")).rejects.toThrow(/not found/);
    await expect(svc.decideApplication(r, a.id, "MAYBE")).rejects.toThrow(/Invalid/);
    await svc.decideApplication(r, a.id, "ACCEPTED");
    expect(outbox.at(-1)).toMatchObject({ to: s.email, subject: expect.stringContaining("accepted") });
    await expect(svc.decideApplication(r, a.id, "REJECTED")).rejects.toThrow(/already been decided/);
  });
});

describe("scheduling", () => {
  it("slot validation: future, ordered, no overlap, owner only", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const t = (h: number) => new Date(NOW.getTime() + h * H);
    await svc.addSlot(r, st.id, t(24), t(25), NOW);
    await expect(svc.addSlot(r, st.id, t(24.5), t(25.5), NOW)).rejects.toThrow(/overlaps/);
    await expect(svc.addSlot(r, st.id, t(-1), t(1), NOW)).rejects.toThrow(/future/);
    await expect(svc.addSlot(r, st.id, t(30), t(29), NOW)).rejects.toThrow(/after/);
    await expect(svc.addSlot(r, st.id, null, t(29), NOW)).rejects.toThrow(/valid/);
    await svc.addSlot(r, st.id, t(25), t(26), NOW); // touching is fine
    const other = await researcher();
    await expect(svc.addSlot(other, st.id, t(40), t(41), NOW)).rejects.toThrow(/not found/);
  });

  it("only accepted applicants can book; one booking per application; confirmation email", async () => {
    const { s, app, slots, st, r } = await acceptedSetup(2);
    const s2 = await student();
    const pendingApp = await svc.applyToStudy(s2, st.id, applyInput(), NOW);
    await expect(svc.bookSlot(s2, pendingApp.id, slots[0].id, NOW)).rejects.toThrow(/after being accepted/);
    await expect(svc.bookSlot(s2, app.id, slots[0].id, NOW)).rejects.toThrow(/not found/); // not their app
    await svc.bookSlot(s, app.id, slots[0].id, NOW);
    expect(outbox.at(-1)?.subject).toMatch(/confirmed/);
    await expect(svc.bookSlot(s, app.id, slots[1].id, NOW)).rejects.toThrow(/already booked/);
    await expect(svc.deleteSlot(r, slots[0].id)).rejects.toThrow(/Booked/);
    await svc.deleteSlot(r, slots[1].id);
    expect(await db.availabilitySlot.count()).toBe(1);
  });

  it("no double-booking under concurrency", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const slot = await svc.addSlot(r, st.id, new Date(NOW.getTime() + 30 * H), new Date(NOW.getTime() + 31 * H), NOW);
    const people = [];
    for (let i = 0; i < 6; i++) {
      const s = await student();
      const a = await svc.applyToStudy(s, st.id, applyInput(), NOW);
      await svc.decideApplication(r, a.id, "ACCEPTED");
      people.push({ s, a });
    }
    const results = await Promise.allSettled(people.map(({ s, a }) => svc.bookSlot(s, a.id, slot.id, NOW)));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.booking.count({ where: { slotId: slot.id } })).toBe(1);
    expect((await db.availabilitySlot.findUnique({ where: { id: slot.id } }))!.isBooked).toBe(true);
  });

  it("property: any sequence of booking attempts yields ≤1 booking per slot and per application", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(fc.nat(3), fc.nat(3)), { minLength: 1, maxLength: 12 }), async (attempts) => {
        await wipe();
        const r = await researcher();
        const st = await svc.createStudy(r, studyInput());
        const slots: { id: string }[] = [];
        for (let i = 0; i < 4; i++) slots.push(await svc.addSlot(r, st.id, new Date(NOW.getTime() + (24 + i) * H), new Date(NOW.getTime() + (25 + i) * H), NOW));
        const apps: { s: Awaited<ReturnType<typeof student>>; a: { id: string } }[] = [];
        for (let i = 0; i < 4; i++) {
          const s = await student();
          const a = await svc.applyToStudy(s, st.id, applyInput(), NOW);
          await svc.decideApplication(r, a.id, "ACCEPTED");
          apps.push({ s, a });
        }
        await Promise.allSettled(attempts.map(([ai, si]) => svc.bookSlot(apps[ai].s, apps[ai].a.id, slots[si].id, NOW)));
        const bookings = await db.booking.findMany();
        expect(new Set(bookings.map((b) => b.slotId)).size).toBe(bookings.length);
        expect(new Set(bookings.map((b) => b.applicationId)).size).toBe(bookings.length);
        const booked = await db.availabilitySlot.findMany({ where: { isBooked: true } });
        expect(booked.map((s) => s.id).sort()).toEqual(bookings.map((b) => b.slotId).sort());
      }),
      { numRuns: 15 },
    );
  });
});

describe("reminders", () => {  it("sends one reminder for tomorrow's appointment and is idempotent", async () => {
    const { s, app, slots } = await acceptedSetup(1); // slot at NOW+24h → tomorrow (Sun) 10:00 EDT
    await svc.bookSlot(s, app.id, slots[0].id, NOW);
    outbox.length = 0;
    // Two days before: not due yet.
    expect((await svc.sendDueReminders(new Date(NOW.getTime() - 24 * H))).sent).toBe(0);
    const first = await svc.sendDueReminders(NOW);
    expect(first.sent).toBe(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: s.email, subject: expect.stringMatching(/Reminder/) });
    expect((await db.booking.findFirst())!.reminderSentAt?.toISOString()).toBe(NOW.toISOString());
    const [a, b] = await Promise.all([svc.sendDueReminders(NOW), svc.sendDueReminders(NOW)]);
    expect(a.sent + b.sent).toBe(0);
    expect(outbox).toHaveLength(1);
  });
});

describe("search by school", () => {
  async function fixture() {
    const umb = await school({ name: "University of Massachusetts Boston", aliases: "UMass Boston, UMB", emailDomain: "umb.edu" });
    const bu = await school({ name: "Boston University", aliases: "BU", emailDomain: "bu.edu" });
    const smith = await school({ name: "Smith College", emailDomain: "smith.edu" });
    const mit = await school({ name: "Massachusetts Institute of Technology", aliases: "MIT", emailDomain: "mit.edu" });
    const rU = await researcher(true, umb.id);
    const rB = await researcher(true, bu.id);
    const rS = await researcher(true, smith.id);
    const rM = await researcher(true, mit.id);
    await svc.createStudy(rU, studyInput({ name: "UMB Sleep", condition: "Sleep", city: "Boston" }));
    await svc.createStudy(rU, studyInput({ name: "UMB Migraine", condition: "Migraine", city: "Boston" }));
    await svc.createStudy(rB, studyInput({ name: "BU Asthma", condition: "Asthma", city: "Boston" }));
    await svc.createStudy(rS, studyInput({ name: "Smith Vision", condition: "Vision", city: "Northampton" }));
    await svc.createStudy(rM, studyInput({ name: "MIT Hearing", condition: "Hearing", city: "Cambridge" }));
    return { umb, bu };
  }
  const names = async (q: string, extra: Partial<svc.StudyFilters> = {}) =>
    (await svc.searchStudies({ q, ...extra })).studies.map((s) => s.name).sort();

  it("finds studies by full school name, alias, short name and email domain", async () => {
    await fixture();
    expect(await names("University of Massachusetts Boston")).toEqual(["UMB Migraine", "UMB Sleep"]);
    expect(await names("umass boston")).toEqual(["UMB Migraine", "UMB Sleep"]);
    expect(await names("UMB")).toEqual(["UMB Migraine", "UMB Sleep"]);
    expect(await names("umb.edu")).toEqual(["UMB Migraine", "UMB Sleep"]);
    expect(await names("Boston University")).toEqual(["BU Asthma"]);
    expect(await names("Smith College")).toEqual(["Smith Vision"]);
    expect(await names("MIT")).toEqual(["MIT Hearing"]); // not Smith
    expect(await names("Massachusetts")).toEqual(["MIT Hearing", "UMB Migraine", "UMB Sleep"]);
  });

  it("combines school and topic tokens", async () => {
    await fixture();
    expect(await names("sleep umass")).toEqual(["UMB Sleep"]);
    expect(await names("asthma at BU")).toEqual(["BU Asthma"]);
    expect(await names("vision mit")).toEqual([]);
  });

  it("still matches city/condition and returns school names for cards", async () => {
    await fixture();
    expect(await names("Cambridge")).toEqual(["MIT Hearing"]);
    expect(await names("boston")).toEqual(["BU Asthma", "UMB Migraine", "UMB Sleep"]);
    const r = await svc.searchStudies({ q: "UMB" });
    expect(r.studies[0].researcher.school?.name).toBe("University of Massachusetts Boston");
    expect((await svc.searchStudies({ q: "Psychology" })).total).toBe(5); // department
  });

  it("school filter and page clamping", async () => {
    const { bu } = await fixture();
    expect(await names("", { school: bu.id })).toEqual(["BU Asthma"]);
    const r = await svc.searchStudies({ page: 99 }, 2);
    expect(r).toMatchObject({ total: 5, pageCount: 3, page: 3 });
    expect(r.studies).toHaveLength(1);
  });

  it("ignores LIKE wildcards instead of matching everything", async () => {
    await fixture();
    expect(await names("asth%")).toEqual(["BU Asthma"]);
    expect(await names("%sthma")).toEqual([]); // no leading-wildcard substring match
    expect(await names("as_hma")).toEqual([]);
    expect((await svc.searchStudies({ q: "%" })).total).toBe(5); // nothing left to search → unfiltered
  });

  it("matches at word starts in study text (partial words OK)", async () => {
    await fixture();
    expect(await names("migr")).toEqual(["UMB Migraine"]);
    expect(await names("igraine")).toEqual([]);
  });
});

describe("login lockout", () => {
  it(`locks after ${svc.MAX_FAILED_LOGINS} failures, rejects even the right password, unlocks after the window`, async () => {
    const u = await student();
    const t0 = new Date("2026-10-24T14:00:00Z");
    for (let i = 0; i < svc.MAX_FAILED_LOGINS; i++) {
      await expect(svc.authenticate(u.username, "wrong-pass", "STUDENT", t0)).rejects.toThrow(/Invalid/);
    }
    await expect(svc.authenticate(u.username, "password123", "STUDENT", t0)).rejects.toThrow(/Too many/);
    const later = new Date(t0.getTime() + (svc.LOCKOUT_MINUTES + 1) * 60_000);
    await expect(svc.authenticate(u.username, "password123", "STUDENT", later)).resolves.toMatchObject({ id: u.id });
    expect((await db.user.findUnique({ where: { id: u.id } }))).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });

  it("a successful login resets the failure counter", async () => {
    const u = await student();
    for (let i = 0; i < svc.MAX_FAILED_LOGINS - 1; i++) await svc.authenticate(u.username, "nope-nope", "STUDENT").catch(() => {});
    await svc.authenticate(u.username, "password123", "STUDENT");
    await svc.authenticate(u.username, "nope-nope", "STUDENT").catch(() => {});
    await expect(svc.authenticate(u.username, "password123", "STUDENT")).resolves.toBeTruthy();
  });
});

describe("consent PDFs", () => {
  const pdf = (body = "hello") => new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF`);

  it("stores an uploaded PDF and bumps the version when it changes or is removed", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput({ consentPdf: pdf() }));
    let cf = (await db.consentForm.findUnique({ where: { studyId: st.id } }))!;
    expect(cf.fileUrl).toMatch(/^\/api\/files\/consent\/[a-f0-9-]{36}\.pdf$/);
    expect(cf.version).toBe(1);
    expect(readdirSync(uploads)).toHaveLength(1);

    await svc.updateStudy(r, st.id, studyInput()); // no new file → keeps PDF, same version
    cf = (await db.consentForm.findUnique({ where: { studyId: st.id } }))!;
    expect(cf.version).toBe(1);
    expect(cf.fileUrl).not.toBeNull();

    await svc.updateStudy(r, st.id, studyInput({ consentPdf: pdf("v2") }));
    cf = (await db.consentForm.findUnique({ where: { studyId: st.id } }))!;
    expect(cf.version).toBe(2);

    await svc.updateStudy(r, st.id, studyInput({ removeConsentPdf: true }));
    cf = (await db.consentForm.findUnique({ where: { studyId: st.id } }))!;
    expect(cf).toMatchObject({ version: 3, fileUrl: null });
  });

  it("rejects non-PDFs and oversized files", async () => {
    const r = await researcher();
    await expect(svc.createStudy(r, studyInput({ consentPdf: new TextEncoder().encode("<html>") }))).rejects.toThrow(/must be a PDF/);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    await expect(svc.createStudy(r, studyInput({ consentPdf: big }))).rejects.toThrow(/5 MB/);
    expect(await db.study.count()).toBe(0);
  });
});

describe("email log", () => {
  it("records every email (dev mode) for the admin log", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const s = await student();
    const a = await svc.applyToStudy(s, st.id, applyInput(), NOW);
    await svc.decideApplication(r, a.id, "REJECTED");
    const logs = await db.emailLog.findMany({ where: { NOT: { subject: "Confirm your MassRecruit email" } } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ to: s.email, status: "DEV_LOGGED", subject: expect.stringMatching(/Update on your application/) });
  });
});

describe("rate limiting (Postgres-backed)", () => {
  it("allows `limit` hits per window, then blocks, then resets in the next window", async () => {
    await db.rateLimit.deleteMany();
    const t = new Date("2026-10-24T14:00:00Z");
    const key = `test:${uid()}`;
    for (let i = 0; i < 3; i++) expect(await svc.consumeRateLimit(key, 3, 60_000, t)).toBe(true);
    expect(await svc.consumeRateLimit(key, 3, 60_000, t)).toBe(false);
    expect(await svc.consumeRateLimit(key, 3, 60_000, new Date(t.getTime() + 60_000))).toBe(true);
  });

  it("counts concurrent hits exactly (atomic upsert)", async () => {
    const key = `test:${uid()}`;
    const t = new Date("2026-10-24T14:00:00Z");
    const results = await Promise.all(Array.from({ length: 25 }, () => svc.consumeRateLimit(key, 10, 60_000, t)));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect((await db.rateLimit.findUnique({ where: { key } }))!.count).toBe(25);
  });

  it("enforceRateLimit throws a user-facing error when exceeded", async () => {
    const id = uid();
    for (let i = 0; i < svc.LIMITS.register.limit; i++) await svc.enforceRateLimit("register", id);
    await expect(svc.enforceRateLimit("register", id)).rejects.toThrow(/Too many attempts/);
  });
});

describe("email verification", () => {
  const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1];

  it("emails a one-time link on sign-up; the token is single-use and stored only as a hash", async () => {
    const u = await svc.registerUser({ role: "STUDENT", username: uid(), password: "password123", name: "New Person", email: `${uid()}@umb.edu` });
    expect(u.emailVerifiedAt).toBeNull();
    const mail = outbox.at(-1)!;
    expect(mail).toMatchObject({ to: u.email, subject: "Confirm your MassRecruit email" });
    const token = tokenFrom(mail.text);
    const row = (await db.user.findUnique({ where: { id: u.id } }))!;
    expect(row.emailTokenHash).not.toContain(token);
    expect(row.emailTokenHash).toMatch(/^[a-f0-9]{64}$/);

    await svc.verifyEmailToken(token);
    expect((await db.user.findUnique({ where: { id: u.id } }))!.emailVerifiedAt).not.toBeNull();
    await expect(svc.verifyEmailToken(token)).rejects.toThrow(/invalid|expired|used/);
  });

  it("rejects expired, malformed and unknown tokens", async () => {
    const t0 = new Date("2026-10-24T14:00:00Z");
    const u = await svc.registerUser({ role: "STUDENT", username: uid(), password: "password123", name: "Late Person", email: `${uid()}@umb.edu` });
    await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: null } });
    await svc.sendVerificationEmail(u.id, t0);
    const token = tokenFrom(outbox.at(-1)!.text);
    await expect(svc.verifyEmailToken(token, new Date(t0.getTime() + (svc.EMAIL_TOKEN_HOURS + 1) * 3600_000))).rejects.toThrow(/expired/);
    await expect(svc.verifyEmailToken("short")).rejects.toThrow(/invalid/);
    await expect(svc.verifyEmailToken("x".repeat(43))).rejects.toThrow(/invalid/);
  });

  it("unconfirmed students can't apply; an unconfirmed ADMIN_EMAILS account can't act as admin", async () => {
    const r = await researcher();
    const st = await svc.createStudy(r, studyInput());
    const s = await svc.registerUser({ role: "STUDENT", username: uid(), password: "password123", name: "Jordan Student", email: `${uid()}@umb.edu` });
    await expect(svc.applyToStudy(s, st.id, applyInput(), NOW)).rejects.toThrow(/confirm your email/);

    const pending = await researcher(false);
    const boss = await svc.registerUser({ role: "STUDENT", username: "boss2", password: "password123", name: "B O", email: "boss@umb.edu" });
    expect(boss.role).toBe("ADMIN");
    await expect(svc.setResearcherVerified(boss, pending.id, true)).rejects.toThrow(/confirm your email/);
  });

  it("stored email log masks the token when the email is actually delivered", async () => {
    // DEV_LOGGED keeps it readable (the log is the delivery channel in dev).
    const u = await svc.registerUser({ role: "STUDENT", username: uid(), password: "password123", name: "Log Person", email: `${uid()}@umb.edu` });
    const token = tokenFrom(outbox.at(-1)!.text);
    const devLog = await db.emailLog.findFirst({ where: { to: u.email }, orderBy: { createdAt: "desc" } });
    expect(devLog!.text).toContain(token);

    // Real delivery path (Resend) with a stubbed network call.
    const realFetch = globalThis.fetch;
    process.env.RESEND_API_KEY = "re_test";
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    try {
      await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: null } });
      await svc.sendVerificationEmail(u.id);
    } finally {
      globalThis.fetch = realFetch;
      process.env.RESEND_API_KEY = "";
    }
    const sent = await db.emailLog.findFirst({ where: { to: u.email, status: "SENT" } });
    expect(sent!.text).toContain("token=[redacted]");
  });
});

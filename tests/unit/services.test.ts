import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { db } from "@/lib/db";
import { outbox } from "@/lib/email";
import * as svc from "@/lib/services";

const NOW = new Date("2026-10-24T14:00:00Z"); // Sat 10:00 EDT
const H = 3600_000;

async function wipe() {
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

async function school() {
  return db.school.create({ data: { name: `School ${uid()}`, emailDomain: "umb.edu", city: "Boston" } });
}
async function student(name = "Jordan Student") {
  return svc.registerUser({ role: "STUDENT", username: uid(), password: "password123", name, email: `${uid()}@umb.edu` });
}
async function researcher(verified = true) {
  const s = await school();
  const r = await svc.registerUser({
    role: "RESEARCHER", username: uid(), password: "password123", name: "Dr. R", email: `${uid()}@umb.edu`,
    schoolId: s.id, departmentName: "Psychology",
  });
  return verified ? db.user.update({ where: { id: r.id }, data: { verified: true } }) : r;
}
const studyInput = (o: Partial<svc.StudyInput> = {}): svc.StudyInput => ({
  name: "Sleep and Memory", condition: "Sleep", city: "Boston", phase: "NA", status: "RECRUITING", irbId: "IRB-1",
  compensationType: "CASH", compensationDetails: "$20 cash", description: "A study about sleep and memory.",
  eligibility: "Age 18+", minAge: 18, consentText: "I agree to participate in this research study voluntarily.", ...o,
});
const applyInput = (o: Partial<svc.ApplyInput> = {}): svc.ApplyInput => ({
  name: "Jordan Student", email: "jordan@umb.edu", dateOfBirth: new Date("2000-01-01T00:00:00Z"),
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

beforeEach(wipe);
afterAll(async () => {
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
    const admin = await svc.registerUser({ role: "STUDENT", username: "boss", password: "password123", name: "B O", email: "boss@umb.edu" });
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
    await expect(svc.applyToStudy(s, st.id, applyInput({ email: "j@gmail.com" }), NOW)).rejects.toThrow(/\.edu/);
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
    expect(outbox.at(-1)).toMatchObject({ to: "jordan@umb.edu", subject: expect.stringContaining("accepted") });
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

describe("reminders", () => {
  it("sends one reminder for tomorrow's appointment and is idempotent", async () => {
    const { s, app, slots } = await acceptedSetup(1); // slot at NOW+24h → tomorrow (Sun) 10:00 EDT
    await svc.bookSlot(s, app.id, slots[0].id, NOW);
    outbox.length = 0;
    // Two days before: not due yet.
    expect((await svc.sendDueReminders(new Date(NOW.getTime() - 24 * H))).sent).toBe(0);
    const first = await svc.sendDueReminders(NOW);
    expect(first.sent).toBe(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "jordan@umb.edu", subject: expect.stringMatching(/Reminder/) });
    expect((await db.booking.findFirst())!.reminderSentAt?.toISOString()).toBe(NOW.toISOString());
    const [a, b] = await Promise.all([svc.sendDueReminders(NOW), svc.sendDueReminders(NOW)]);
    expect(a.sent + b.sent).toBe(0);
    expect(outbox).toHaveLength(1);
  });
});

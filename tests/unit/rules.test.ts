import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ageOn,
  consentSignatureMatches,
  isAllowedEmail,
  isDueForReminder,
  meetsMinAge,
  parseAdminEmails,
  parseDateOnly,
  parseMinAge,
  queryTokens,
  schoolMatchesTerm,
  validatePassword,
  validateSlot,
  validateUsername,
  zonedDateKey,
  zonedWallTimeToUtc,
} from "@/lib/rules";
import { parseCsv } from "@/lib/csv";

const DAY = 86_400_000;
const dateArb = fc.date({ min: new Date("1930-01-01T00:00:00Z"), max: new Date("2090-12-31T00:00:00Z"), noInvalidDate: true });

describe("isAllowedEmail (.edu restriction)", () => {
  it.each([
    ["a@umb.edu", true],
    ["First.Last@Mail.Harvard.EDU", true],
    ["x@edu", false], // bare TLD isn't a real school domain
    ["a@gmail.com", false],
    ["a@umb.edu.evil.com", false],
    ["a@notedu", false],
    ["a@fakeedu.com", false],
    ["no-at-sign.edu", false],
    ["a b@umb.edu", false],
    ["", false],
  ])("%s → %s", (email, ok) => expect(isAllowedEmail(email)).toBe(ok));

  it("property: any non-.edu domain is rejected", () => {
    fc.assert(
      fc.property(fc.domain(), (d) => {
        fc.pre(!/(^|\.)edu$/i.test(d));
        expect(isAllowedEmail(`user@${d}`)).toBe(false);
      }),
    );
  });

  it("property: valid local@sub.edu is accepted", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9._-]{1,20}$/), fc.stringMatching(/^[a-z0-9]{1,15}$/), (local, sub) => {
        expect(isAllowedEmail(`${local}@${sub}.edu`)).toBe(true);
      }),
    );
  });
});

describe("username / password validation", () => {
  it("accepts valid usernames and rejects invalid", () => {
    expect(validateUsername("jordan.s")).toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("has space")).not.toBeNull();
    expect(validateUsername("a".repeat(31))).not.toBeNull();
    expect(validateUsername("  MiXeD  ")).toBeNull(); // normalized
  });
  it("password length bounds", () => {
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("x".repeat(72))).toBeNull();
    expect(validatePassword("x".repeat(73))).not.toBeNull(); // bcrypt's 72-byte limit
    expect(validatePassword("é".repeat(37))).not.toBeNull(); // 74 bytes in UTF-8
  });
  it("parseAdminEmails trims, lowercases, drops blanks", () => {
    expect(parseAdminEmails(" A@umb.edu, ,b@mit.edu ")).toEqual(["a@umb.edu", "b@mit.edu"]);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe("age eligibility", () => {
  it("birthday boundary", () => {
    const dob = new Date("2008-10-24T00:00:00Z");
    expect(ageOn(dob, new Date("2026-10-23T12:00:00Z"))).toBe(17);
    expect(ageOn(dob, new Date("2026-10-24T00:00:00Z"))).toBe(18);
    expect(meetsMinAge(dob, 18, new Date("2026-10-23T23:59:59Z"))).toBe(false);
    expect(meetsMinAge(dob, 18, new Date("2026-10-24T00:00:00Z"))).toBe(true);
  });
  it("leap-day birthdays turn a year older on Mar 1 in non-leap years", () => {
    const dob = new Date("2004-02-29T00:00:00Z");
    expect(ageOn(dob, new Date("2025-02-28T00:00:00Z"))).toBe(20);
    expect(ageOn(dob, new Date("2025-03-01T00:00:00Z"))).toBe(21);
  });
  it("property: age is monotonic non-decreasing in `on`", () => {
    fc.assert(
      fc.property(dateArb, dateArb, dateArb, (dob, a, b) => {
        const [x, y] = a <= b ? [a, b] : [b, a];
        expect(ageOn(dob, x)).toBeLessThanOrEqual(ageOn(dob, y));
      }),
    );
  });
  it("property: age is exactly n on the n-th anniversary (non-leap-day dob)", () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: 0, max: 80 }), (dob, n) => {
        fc.pre(!(dob.getUTCMonth() === 1 && dob.getUTCDate() === 29));
        const anniv = new Date(Date.UTC(dob.getUTCFullYear() + n, dob.getUTCMonth(), dob.getUTCDate()));
        expect(ageOn(dob, anniv)).toBe(n);
        expect(ageOn(dob, new Date(anniv.getTime() - DAY))).toBe(n - 1);
      }),
    );
  });
  it("parseMinAge", () => {
    expect(parseMinAge("Age 21+; non-smoker.")).toBe(21);
    expect(parseMinAge("age 18 + only")).toBe(18);
    expect(parseMinAge("Generally healthy")).toBe(18);
  });
  it("parseDateOnly rejects impossible dates", () => {
    expect(parseDateOnly("2001-02-29")).toBeNull();
    expect(parseDateOnly("2000-02-29")?.toISOString()).toBe("2000-02-29T00:00:00.000Z");
    expect(parseDateOnly("13/01/2000")).toBeNull();
    expect(parseDateOnly("2000-13-01")).toBeNull();
  });
  it("property: parseDateOnly round-trips ISO dates", () => {
    fc.assert(
      fc.property(dateArb, (d) => {
        const key = d.toISOString().slice(0, 10);
        expect(parseDateOnly(key)?.toISOString().slice(0, 10)).toBe(key);
      }),
    );
  });
});

describe("consent signature", () => {
  it("matches name ignoring case and extra whitespace", () => {
    expect(consentSignatureMatches("  jordan   STUDENT ", "Jordan Student")).toBe(true);
    expect(consentSignatureMatches("Jordan", "Jordan Student")).toBe(false);
    expect(consentSignatureMatches("   ", "")).toBe(false);
  });
  it("property: a name signed as itself (with padding) matches; a different name does not", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), fc.string({ minLength: 1, maxLength: 40 }), (name, other) => {
        fc.pre(name.trim().length > 0);
        expect(consentSignatureMatches(`  ${name}  `, name)).toBe(true);
        const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
        if (norm(other) !== norm(name)) expect(consentSignatureMatches(other, name)).toBe(false);
      }),
    );
  });
});

describe("time zones", () => {
  it("converts Boston wall time across DST", () => {
    expect(zonedWallTimeToUtc("2026-07-01 12:00:00")?.toISOString()).toBe("2026-07-01T16:00:00.000Z"); // EDT
    expect(zonedWallTimeToUtc("2026-12-01T12:00")?.toISOString()).toBe("2026-12-01T17:00:00.000Z"); // EST
    expect(zonedWallTimeToUtc("garbage")).toBeNull();
    expect(zonedWallTimeToUtc("2026-01-01T25:00")).toBeNull();
  });
  it("property: wall time → UTC → wall time round-trips (outside DST gaps)", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2020-01-01"), max: new Date("2035-01-01"), noInvalidDate: true }), (instant) => {
        const wall = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(instant); // "YYYY-MM-DD HH:mm"
        const back = zonedWallTimeToUtc(wall)!;
        const rounded = Math.floor(instant.getTime() / 60_000) * 60_000;
        // Ambiguous fall-back hour may resolve to either occurrence (±1h).
        expect([0, 3600_000]).toContain(Math.abs(back.getTime() - rounded));
      }),
    );
  });
});

describe("slot validation", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  it("rules", () => {
    expect(validateSlot(new Date("2026-10-25T14:00Z"), new Date("2026-10-25T15:00Z"), now)).toBeNull();
    expect(validateSlot(new Date("2026-10-24T11:00Z"), new Date("2026-10-24T13:00Z"), now)).toMatch(/future/);
    expect(validateSlot(new Date("2026-10-25T15:00Z"), new Date("2026-10-25T15:00Z"), now)).toMatch(/after/);
    expect(validateSlot(new Date("2026-10-25T00:00Z"), new Date("2026-10-25T09:00Z"), now)).toMatch(/8 hours/);
  });
  it("property: valid ⇔ future start, positive duration ≤ 8h", () => {
    fc.assert(
      fc.property(fc.integer({ min: -5 * DAY, max: 5 * DAY }), fc.integer({ min: -2 * 3600_000, max: 10 * 3600_000 }), (off, dur) => {
        const start = new Date(now.getTime() + off);
        const end = new Date(start.getTime() + dur);
        const expected = off > 0 && dur > 0 && dur <= 8 * 3600_000;
        expect(validateSlot(start, end, now) === null).toBe(expected);
      }),
    );
  });
});

describe("reminder schedule (one day before)", () => {
  // 2026-10-24 10:00 EDT
  const now = new Date("2026-10-24T14:00:00Z");
  it("due only for appointments on the next Boston calendar day", () => {
    expect(isDueForReminder(new Date("2026-10-25T13:00:00Z"), now, null)).toBe(true); // tomorrow 9am
    expect(isDueForReminder(new Date("2026-10-26T03:30:00Z"), now, null)).toBe(true); // tomorrow 11:30pm EDT
    expect(isDueForReminder(new Date("2026-10-26T04:30:00Z"), now, null)).toBe(false); // day after (00:30 EDT)
    expect(isDueForReminder(new Date("2026-10-24T20:00:00Z"), now, null)).toBe(false); // today
    expect(isDueForReminder(new Date("2026-10-25T13:00:00Z"), now, new Date())).toBe(false); // already sent
  });
  it("property: due ⇒ in the future, < 48h away, not yet sent, and on tomorrow's date", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2025-01-01"), max: new Date("2030-01-01"), noInvalidDate: true }),
        fc.integer({ min: -DAY, max: 4 * DAY }),
        fc.boolean(),
        (n, off, sent) => {
          const slot = new Date(n.getTime() + off);
          const due = isDueForReminder(slot, n, sent ? n : null);
          if (due) {
            expect(sent).toBe(false);
            expect(off).toBeGreaterThan(0);
            expect(off).toBeLessThan(2 * DAY);
            const tomorrow = new Date(Date.parse(zonedDateKey(n) + "T00:00:00Z") + DAY).toISOString().slice(0, 10);
            expect(zonedDateKey(slot)).toBe(tomorrow);
          }
        },
      ),
    );
  });
  it("property: every appointment gets exactly one due day when the cron runs daily", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2025-01-01"), max: new Date("2030-01-01"), noInvalidDate: true }),
        fc.integer({ min: 0, max: 23 }),
        (slot, cronHourUtc) => {
          // Simulate one cron run per day at a fixed UTC hour over the 4 days before the slot.
          let dueRuns = 0;
          const base = Date.UTC(slot.getUTCFullYear(), slot.getUTCMonth(), slot.getUTCDate(), cronHourUtc);
          for (let d = -4; d <= 0; d++) {
            const run = new Date(base + d * DAY);
            if (isDueForReminder(slot, run, null)) dueRuns++;
          }
          expect(dueRuns).toBe(1);
        },
      ),
    );
  });
});

describe("school search matching", () => {
  const umb = { name: "University of Massachusetts Boston", aliases: "UMass Boston, UMB", emailDomain: "umb.edu" };
  const mit = { name: "Massachusetts Institute of Technology", aliases: "MIT", emailDomain: "mit.edu" };
  const smith = { name: "Smith College", aliases: "", emailDomain: "smith.edu" };
  const bu = { name: "Boston University", aliases: "BU", emailDomain: "bu.edu" };
  it.each([
    [umb, "University of Massachusetts Boston", true],
    [umb, "umass boston", true],
    [umb, "UMass", true],
    [umb, "umb", true],
    [umb, "umb.edu", true],
    [umb, "@umb.edu", true],
    [umb, "Massachusetts", true],
    [umb, "boston", true],
    [umb, "Boston University", false],
    [bu, "Boston University", true],
    [bu, "bu", true],
    [mit, "MIT", true],
    [smith, "mit", false], // word-start only: "Smith" must not match "mit"
    [smith, "smith", true],
    [umb, "", false],
    [umb, "(", false], // regex metacharacters are escaped
  ])("%o ~ %s → %s", (school, term, ok) => expect(schoolMatchesTerm(school, term)).toBe(ok));

  it("property: never throws and a school always matches its own name", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 .,&'()-]{0,29}$/), (term, name) => {
        const s = { name, aliases: "", emailDomain: "x.edu" };
        expect(() => schoolMatchesTerm(s, term)).not.toThrow();
        expect(schoolMatchesTerm(s, name)).toBe(true);
      }),
    );
  });

  it("queryTokens drops stopwords unless nothing is left", () => {
    expect(queryTokens("  sleep   at   UMass ")).toEqual(["sleep", "UMass"]);
    expect(queryTokens("of the")).toEqual(["of", "the"]);
    expect(queryTokens("")).toEqual([]);
  });
});

describe("CSV parser", () => {
  it("handles quotes, commas, escaped quotes, CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
  it("property: round-trips arbitrary fields", () => {
    const enc = (f: string) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f);
    fc.assert(
      fc.property(fc.array(fc.array(fc.string(), { minLength: 2, maxLength: 5 }), { minLength: 1, maxLength: 6 }), (rows) => {
        const text = rows.map((r) => r.map(enc).join(",")).join("\n") + "\n";
        expect(parseCsv(text)).toEqual(rows);
      }),
    );
  });
});

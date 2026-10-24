import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

// Throwaway E2E database started by scripts/e2e-server.mjs.
const E2E_DB = "postgresql://postgres:postgres@localhost:5435/massrecruit_e2e";

/** Read the confirmation link from the dev email log (the log is the delivery channel without Resend). */
async function confirmationLink(email: string): Promise<string> {
  const c = new Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT text FROM "EmailLog" WHERE "to" = $1 AND subject = 'Confirm your MassRecruit email' ORDER BY "createdAt" DESC LIMIT 1`,
      [email],
    );
    const m = /(\/verify-email\?token=[A-Za-z0-9_-]+)/.exec(rows[0]?.text ?? "");
    if (!m) throw new Error(`no confirmation email for ${email}`);
    return m[1];
  } finally {
    await c.end();
  }
}

const PW = "password123";
const uniq = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4);
// Each test gets its own client IP so per-IP rate limits (login/register) don't
// accumulate across the whole suite. (On Vercel the platform sets this header.)
test.beforeEach(async ({ context }) => {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
});

// Scope to <main>: Next.js also renders a hidden role="alert" route announcer.
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

async function login(page: Page, username: string, role: "Student" | "Researcher" | "Admin", password = PW) {
  await page.goto("/login");
  await page.getByText(role, { exact: true }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the outcome (signed-in header or an error) so later navigations don't race the session cookie.
  await expect(page.getByTestId("whoami").or(alert(page))).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}

test.describe("public browsing (no login)", () => {
  test("study cards show name, compensation and city; search & filters work", async ({ page }) => {
    await page.goto("/studies");
    await expect(page.getByRole("heading", { name: /Find research studies/ })).toBeVisible();
    const cards = page.getByTestId("study-card");
    await expect(cards).toHaveCount(24); // first page
    const first = cards.first();
    await expect(first.getByRole("heading")).not.toBeEmpty();
    await expect(first.getByText("Compensation")).toBeVisible();
    await expect(first.getByText("City")).toBeVisible();

    // Only verified researchers' studies are public: 155 CSV rows + 2 demo studies.
    await expect(page.getByTestId("result-count")).toHaveText("157 studies found");

    await page.getByLabel("Search studies").fill("Worcester");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=Worcester/);
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(cards.nth(i)).toContainText("Worcester");

    await page.goto("/studies?status=CLOSED");
    for (const c of await cards.all()) await expect(c).toContainText("Closed");

    await page.goto("/studies?q=zzzz-no-such-study");
    await expect(page.getByText(/No studies match/)).toBeVisible();

    await page.goto("/studies?page=2");
    await expect(page.getByText("Page 2 of 7")).toBeVisible();
    await page.goto("/studies?page=999"); // out of range → last page, not an empty list
    await expect(page.getByText("Page 7 of 7")).toBeVisible();
    await expect(cards.first()).toBeVisible();
  });

  test("search by school name, short name, or alias", async ({ page }) => {
    const cards = page.getByTestId("study-card");
    const schoolsShown = async () => new Set(await page.getByTestId("card-school").allTextContents());
    const count = async () => Number((await page.getByTestId("result-count").textContent())!.split(" ")[0]);

    await page.goto("/studies");
    await page.getByLabel("Search studies").fill("University of Massachusetts Boston");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=University/);
    await expect(cards.first()).toBeVisible();
    const fullNameCount = await count();
    expect(fullNameCount).toBeGreaterThan(2);
    expect(await schoolsShown()).toEqual(new Set(["University of Massachusetts Boston"]));

    for (const q of ["UMass Boston", "umb", "umb.edu"]) {
      await page.goto(`/studies?q=${encodeURIComponent(q)}`);
      await expect(cards.first()).toBeVisible();
      expect(await count(), q).toBe(fullNameCount);
      expect(await schoolsShown(), q).toEqual(new Set(["University of Massachusetts Boston"]));
    }

    await page.goto("/studies?q=Harvard");
    await expect(cards.first()).toBeVisible();
    expect(await schoolsShown()).toEqual(new Set(["Harvard University"]));

    await page.goto("/studies?q=MIT");
    await expect(cards.first()).toBeVisible();
    expect(await schoolsShown()).toEqual(new Set(["Massachusetts Institute of Technology"])); // not Smith College

    // Topic + school.
    await page.goto("/studies?q=" + encodeURIComponent("Sleep UMass"));
    await expect(cards.filter({ hasText: "Sleep Habits and Memory in College Students" })).toHaveCount(1);
    for (const s of await schoolsShown()) expect(s).toMatch(/UMass|University of Massachusetts/);

    // School dropdown filter.
    await page.goto("/studies");
    await page.getByLabel("School").selectOption({ label: "Tufts University" });
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/school=/);
    await expect(cards.first()).toBeVisible();
    expect(await schoolsShown()).toEqual(new Set(["Tufts University"]));
  });

  test("detail page shows description, eligibility, compensation, IRB, contact, data-use notice", async ({ page }) => {
    await page.goto("/studies?q=Sleep Habits");
    await page.getByTestId("study-card").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sleep Habits and Memory in College Students");
    await expect(page.getByText("$30 gift card")).toBeVisible();
    await expect(page.getByText("Age 18+; full-time student.")).toBeVisible();
    await expect(page.getByText(/^IRB-UMB-/)).toBeVisible();
    await expect(page.getByRole("link", { name: "riley.chen@umb.edu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How your data is used" })).toBeVisible();
    await page.getByRole("link", { name: "Sign in to apply" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fstudies%2F/);
  });

  test("unknown study → 404", async ({ page }) => {
    const res = await page.goto("/studies/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});

test.describe("auth", () => {
  test("registration requires .edu and keeps input on error; success signs in", async ({ page }) => {
    const u = `stu${uniq()}`;
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Casey Tester");
    await page.getByLabel("University email").fill(`${u}@gmail.com`);
    await page.getByLabel("Username").fill(u);
    await page.locator("input[name=password]").fill(PW);
    await page.locator("input[name=confirm]").fill(PW);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(alert(page)).toContainText(".edu");
    await expect(page.getByLabel("Full name")).toHaveValue("Casey Tester"); // not reset

    await page.getByLabel("University email").fill(`${u}@umb.edu`);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByTestId("whoami")).toHaveText(`${u} · student`);
  });

  test("login validates password and chosen role", async ({ page }) => {
    await login(page, "student", "Student", "wrong-password");
    await expect(alert(page)).toHaveText("Invalid username or password.");
    await page.getByText("Researcher", { exact: true }).click();
    await page.getByLabel("Password").fill(PW);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert(page)).toContainText('Choose "Student"');
    await page.getByText("Student", { exact: true }).click();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/student$/);
  });

  test("role-based access control and open-redirect protection", async ({ page }) => {
    await page.goto("/student");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/login?next=//evil.example.com");
    await page.getByLabel("Username").fill("student");
    await page.getByLabel("Password").fill(PW);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:3100\/student$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/studies\?denied=1$/);
    await expect(alert(page)).toContainText("don't have access");
    await page.goto("/researcher");
    await expect(page).toHaveURL(/\/studies\?denied=1$/);
  });
});

test("full lifecycle: apply with consent → researcher accepts → student books → reminder cron", async ({ page, request }) => {
  // Student registers and applies.
  const u = `flow${uniq()}`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Morgan Flow");
  await page.getByLabel("University email").fill(`${u}@umb.edu`);
  await page.getByLabel("Username").fill(u);
  await page.locator("input[name=password]").fill(PW);
  await page.locator("input[name=confirm]").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/student$/);

  // Unconfirmed email: banner shown and applying is blocked.
  await expect(page.getByTestId("verify-banner")).toBeVisible();
  await page.goto("/studies?q=Mindfulness App");
  await page.getByTestId("study-card").first().click();
  await expect(page.getByText("Confirm your email address to apply.")).toBeVisible();

  // Open the emailed link and confirm.
  await page.goto(await confirmationLink(`${u}@umb.edu`));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).toHaveURL(/\/student\?verified=1$/);
  await expect(page.getByText("Email confirmed")).toBeVisible();
  await expect(page.getByTestId("verify-banner")).toHaveCount(0);

  await page.goto("/studies?q=Mindfulness App");
  await page.getByTestId("study-card").first().click();
  await expect(page.getByText(/Consent form \(version 1\)/)).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Morgan Flow"); // prefilled

  // Under-age (study requires 21+).
  await page.getByLabel("Date of birth").fill("2007-01-01");
  await page.getByLabel(/I have read the consent form/).check();
  await page.getByLabel("Type your full name to sign").fill("Morgan Flow");
  await page.getByRole("button", { name: /Sign & apply/ }).click();
  await expect(alert(page)).toHaveText("You must be at least 21 to join this study.");

  // Mismatched signature.
  await page.getByLabel("Date of birth").fill("2000-05-05");
  await page.getByLabel("Type your full name to sign").fill("Someone Else");
  await page.getByRole("button", { name: /Sign & apply/ }).click();
  await expect(alert(page)).toContainText("signature must match");

  await page.getByLabel("Type your full name to sign").fill("morgan flow");
  await page.getByRole("button", { name: /Sign & apply/ }).click();
  await expect(page).toHaveURL(/\/student\?applied=1/);
  await expect(page.getByText("Application submitted!")).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();
  await logout(page);

  // Researcher accepts.
  await login(page, "researcher", "Researcher");
  await expect(page).toHaveURL(/\/researcher$/);
  await page.getByRole("link", { name: "Mindfulness App for Exam Stress" }).click();
  const applicant = page.getByTestId("applicant").filter({ hasText: "Morgan Flow" });
  await expect(applicant).toContainText('signed “morgan flow” (v1)');
  await applicant.getByRole("button", { name: "Accept" }).click();
  await expect(applicant).toContainText("accepted");
  await logout(page);

  // Student books a slot.
  await login(page, u, "Student");
  const form = page.getByRole("form", { name: /Book a slot/ });
  await expect(form).toBeVisible();
  await form.getByRole("radio").first().check();
  await form.getByRole("button", { name: "Book this time" }).click();
  await expect(page.getByTestId("booked-time")).toContainText("Appointment:");
  await expect(page.getByRole("form", { name: /Book a slot/ })).toHaveCount(0);
  await logout(page);

  // Researcher sees the booked slot.
  await login(page, "researcher", "Researcher");
  await page.getByRole("link", { name: "Mindfulness App for Exam Stress" }).click();
  await expect(page.getByTestId("slot").filter({ hasText: "booked · Morgan Flow" })).toBeVisible();

  // Cron endpoint is protected.
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ sent: expect.any(Number), failed: 0 });
});

test("admin verification gates researchers; verified researcher publishes a study with slots", async ({ page }) => {
  // Unverified researcher sees the waiting notice, no "New study".
  await login(page, "pending", "Researcher");
  await expect(page.getByText("Awaiting admin verification")).toBeVisible();
  await expect(page.getByRole("link", { name: "+ New study" })).toHaveCount(0);
  await page.goto("/researcher/studies/new");
  await expect(page).toHaveURL(/\/researcher$/);
  await logout(page);

  // Admin approves.
  await login(page, "admin", "Admin");
  await expect(page).toHaveURL(/\/admin$/);
  const row = page.getByTestId("pending-researcher").filter({ hasText: "@pending" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("verified-researcher").filter({ hasText: "@pending" })).toBeVisible();
  await logout(page);

  // Now they can post.
  await login(page, "pending", "Researcher");
  await page.getByRole("link", { name: "+ New study" }).click();
  const title = `E2E Hydration Study ${uniq()}`;
  await page.getByLabel("Study name").fill(title);
  await page.getByLabel("Condition / topic").fill("Hydration");
  await page.getByLabel("IRB ID").fill("IRB-UMB-E2E1");
  await page.getByLabel("Compensation details").fill("$15 gift card");
  await page.getByLabel("Description").fill("We study how hydration affects concentration in students.");
  await page.getByLabel("Consent form text").fill("Short");
  await page.getByRole("button", { name: "Publish study" }).click();
  await expect(alert(page)).toContainText("Consent form text");
  await expect(page.getByLabel("Study name")).toHaveValue(title); // kept on error
  await page.getByLabel("Consent form text").fill("Participation is voluntary. Your data is stored securely and de-identified.");
  await page.getByRole("button", { name: "Publish study" }).click();
  await expect(page).toHaveURL(/\/researcher\/studies\/.+\?created=1/);

  // Add a slot (next week), then reject a duplicate overlapping one.
  const d = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const slotForm = page.getByRole("form", { name: "Add slot" });
  await slotForm.getByLabel("Date").fill(d);
  await slotForm.getByLabel("Start").fill("10:00");
  await slotForm.getByLabel("End").fill("11:00");
  await slotForm.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("slot")).toHaveCount(1);
  await slotForm.getByLabel("Date").fill(d);
  await slotForm.getByLabel("Start").fill("10:30");
  await slotForm.getByLabel("End").fill("11:30");
  await slotForm.getByRole("button", { name: "Add" }).click();
  await expect(slotForm.getByRole("alert")).toContainText("overlaps");
  await expect(page.getByTestId("slot")).toHaveCount(1);

  // Edit consent → version bump.
  await page.getByLabel(/Consent form text/).fill("Updated consent: participation is voluntary; data retained 3 years.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Study saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Consent form text (currently v2)")).toBeVisible();

  // Publicly visible.
  await logout(page);
  await page.goto(`/studies?q=${encodeURIComponent(title)}`);
  await expect(page.getByTestId("study-card")).toHaveCount(1);
  await expect(page.getByTestId("study-card")).toContainText("$15 gift card");
  await expect(page.getByTestId("study-card")).toContainText("Boston");
});

test("consent PDF upload is downloadable, versioned, and shown to applicants; admin sees email log", async ({ page, request }) => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await login(page, "researcher", "Researcher");
  await page.getByRole("link", { name: "Sleep Habits and Memory in College Students" }).click();
  await expect(page.getByText(/Consent form text \(currently v1\)/)).toBeVisible();

  // Wrong file type is rejected.
  await page.getByLabel("Consent PDF (optional)").setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>nope</html>") });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(alert(page)).toContainText("must be a PDF");

  await page.getByLabel("Consent PDF (optional)").setInputFiles({ name: "consent.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Study saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Consent form text \(currently v2\)/)).toBeVisible();
  const href = await page.getByRole("link", { name: "Current consent PDF" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/files\/consent\/[a-f0-9-]{36}\.pdf$/);
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(Buffer.from(await res.body()).equals(pdf)).toBe(true);
  expect((await request.get("/api/files/consent/..%2F..%2Fpackage.json")).status()).toBe(404);
  await logout(page);

  // Student sees the new version + PDF link on the apply form.
  await login(page, "student", "Student");
  await page.goto("/studies?q=" + encodeURIComponent("Sleep Habits"));
  await page.getByTestId("study-card").first().click();
  await expect(page.getByText("Consent form (version 2)")).toBeVisible();
  await expect(page.getByRole("link", { name: "View full consent PDF" })).toHaveAttribute("href", href!);
  await logout(page);

  // Admin email log shows emails sent by earlier flows (acceptance, booking, approval).
  await login(page, "admin", "Admin");
  await page.getByRole("link", { name: "View email log →" }).click();
  await expect(page).toHaveURL(/\/admin\/emails$/);
  const rows = page.getByTestId("email-log");
  await expect(rows.filter({ hasText: "You're accepted: Mindfulness App for Exam Stress" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Appointment confirmed" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "researcher account is approved" })).toHaveCount(1);
  await rows.filter({ hasText: "Appointment confirmed" }).locator("summary").click();
  await expect(rows.filter({ hasText: "Appointment confirmed" }).locator("pre")).toContainText("reminder the day before");
});

test("login lockout after repeated failures", async ({ page }) => {
  // Use a fresh account so other tests' demo logins aren't affected.
  const u = `lock${uniq()}`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Lock Test");
  await page.getByLabel("University email").fill(`${u}@umb.edu`);
  await page.getByLabel("Username").fill(u);
  await page.locator("input[name=password]").fill(PW);
  await page.locator("input[name=confirm]").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/student$/);
  await logout(page);
  for (let i = 0; i < 5; i++) {
    await login(page, u, "Student", "wrong-password");
    await expect(alert(page)).toHaveText("Invalid username or password.");
  }
  await login(page, u, "Student");
  await expect(alert(page)).toContainText("Too many failed sign-in attempts");
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test.describe("landing page", () => {
  test("big title, tagline, and Continue → studies page with the data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "MassRecruit" })).toBeVisible();
    await expect(page.getByText("Your campus. Real research. Real rewards.")).toBeVisible();
    await expect(page.getByTestId("landing-stats")).toHaveText(/^[1-9]\d* studies recruiting now · 20 universities$/);
    await expect(page.getByTestId("study-card")).toHaveCount(0); // data lives on the next page
    await page.getByRole("link", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/studies$/);
    await expect(page.getByTestId("study-card")).toHaveCount(24);
    await expect(page.getByTestId("result-count")).toHaveText(/^1[5-9]\d studies found$/); // 157 seeded (+ any created by earlier tests)
  });
});

test.describe("theme", () => {
  test("dark (black + hot pink) is the default; light persists across pages/reloads; dark restores", async ({ page }) => {
    const html = page.locator("html");
    const bodyColors = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.body);
        return { bg: cs.backgroundColor, fg: cs.color };
      });
    const DARK = { bg: "rgb(0, 0, 0)", fg: "rgb(255, 105, 180)" }; // black + hot pink

    // First visit, no saved preference → dark, already in the server HTML (no flash).
    const res = await page.goto("/");
    expect(await res!.text()).toMatch(/<html[^>]*class="dark"/);
    await expect(html).toHaveClass(/dark/);
    expect(await bodyColors()).toEqual(DARK);
    const toggle = page.getByRole("button", { name: "Dark theme" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const cardBgOn = async () => page.getByTestId("study-card").first().evaluate((el) => getComputedStyle(el).backgroundColor);

    // Switch to light.
    await toggle.click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const light = await bodyColors();
    expect(light.bg).not.toBe("rgb(0, 0, 0)");

    // Light persists on navigation and full reload.
    await page.getByRole("link", { name: /Continue/ }).click();
    await expect(html).not.toHaveClass(/dark/);
    await expect.poll(cardBgOn).toBe("rgb(255, 255, 255)"); // cards animate colour changes
    await page.reload();
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "false");

    // Back to dark.
    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(html).toHaveClass(/dark/);
    expect(await bodyColors()).toEqual(DARK);
    await expect.poll(cardBgOn).toBe("rgb(11, 11, 11)");
  });
});

test.describe("security", () => {
  test("email confirmation links are single-use", async ({ page }) => {
    const u = `once${Date.now().toString(36)}`;
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Once Only");
    await page.getByLabel("University email").fill(`${u}@umb.edu`);
    await page.getByLabel("Username").fill(u);
    await page.locator("input[name=password]").fill(PW);
    await page.locator("input[name=confirm]").fill(PW);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/student$/);
    const link = await confirmationLink(`${u}@umb.edu`);
    await page.goto(link);
    await page.getByRole("button", { name: "Confirm my email" }).click();
    await expect(page).toHaveURL(/verified=1/);
    await page.goto(link);
    await page.getByRole("button", { name: "Confirm my email" }).click();
    await expect(alert(page)).toContainText(/invalid|expired|already/);
  });

  test("nonce-based CSP is sent and the page's scripts carry the nonce", async ({ page }) => {
    const res = await page.goto("/");
    const csp = res!.headers()["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    const scriptNonces = await page.locator("script").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    for (const n of scriptNonces) expect(n).toBe(nonce);
    // Fresh nonce per request.
    const csp2 = (await page.request.get("/")).headers()["content-security-policy"];
    expect(csp2).not.toBe(csp);
  });

  test("session cookie is HttpOnly/Secure/__Host-, and sign-out revokes the old token", async ({ page, context }) => {
    await login(page, "student", "Student");
    await expect(page).toHaveURL(/\/student$/);
    const cookie = (await context.cookies()).find((c) => c.name.includes("mr_session"))!;
    expect(cookie.name).toBe("__Host-mr_session");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });

    await logout(page);
    await context.addCookies([cookie]); // replay the stolen/old cookie
    await page.goto("/student");
    await expect(page).toHaveURL(/\/login$/); // rejected: sessionVersion was bumped
  });

  test("application contact email can't be changed to another address", async ({ page }) => {
    await login(page, "student", "Student");
    await page.goto("/studies?q=" + encodeURIComponent("Sleep Habits"));
    await page.getByTestId("study-card").first().click();
    await expect(page.getByTestId("apply-email")).toHaveText("jordan.student@umb.edu");
    await expect(page.locator('form[aria-label="Apply to study"] input[name=email]')).toHaveCount(0);
  });
});

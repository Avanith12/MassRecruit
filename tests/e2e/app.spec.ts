import { expect, test, type Page } from "@playwright/test";

const PW = "password123";
const uniq = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4);
// Scope to <main>: Next.js also renders a hidden role="alert" route announcer.
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

async function login(page: Page, username: string, role: "Student" | "Researcher" | "Admin", password = PW) {
  await page.goto("/login");
  await page.getByText(role, { exact: true }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}

test.describe("public browsing (no login)", () => {
  test("study cards show name, compensation and city; search & filters work", async ({ page }) => {
    await page.goto("/");
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

    await page.goto("/?status=CLOSED");
    for (const c of await cards.all()) await expect(c).toContainText("Closed");

    await page.goto("/?q=zzzz-no-such-study");
    await expect(page.getByText(/No studies match/)).toBeVisible();

    await page.goto("/?page=2");
    await expect(page.getByText("Page 2 of 7")).toBeVisible();
  });

  test("detail page shows description, eligibility, compensation, IRB, contact, data-use notice", async ({ page }) => {
    await page.goto("/?q=Sleep Habits");
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
    await expect(page).toHaveURL(/\/\?error=/);
    await expect(alert(page)).toContainText("don't have access");
    await page.goto("/researcher");
    await expect(page).toHaveURL(/\/\?error=/);
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

  await page.goto("/?q=Mindfulness App");
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
  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(page.getByTestId("study-card")).toHaveCount(1);
  await expect(page.getByTestId("study-card")).toContainText("$15 gift card");
  await expect(page.getByTestId("study-card")).toContainText("Boston");
});

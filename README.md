# MassRecruit

**Your campus. Real research. Real rewards.**

Hackachusetts · Healthcare & Biotech · Making clinical research more accessible

Students who want to join a study should not have to hunt through paper flyers and old email threads. MassRecruit is one place for Massachusetts universities where a student can see the study, the pay, and how their data will be used, then sign consent and book a time. Researchers publish studies, review applicants, and send a reminder the day before the visit.

**Live demo:** https://massrecruit.vercel.app/

**Demo video:** https://youtu.be/aCxV3wdPmIM

---

## Try the live demo

1. Open https://massrecruit.vercel.app/.
2. Read the landing page, then choose **Continue** to browse studies. No account is required to look.
3. Open a study card. You will see the description, pay, eligibility, IRB ID, and a plain-language data-use notice.
4. Choose **Sign in** in the top right. Pick a role, then type the username from the table below.
5. The password for the live site is in the **Additional information** field of the Hackachusetts submission form. It is not written in this public repository.

| Username | Choose this role | What you can do |
|---|---|---|
| `student` | Student | Apply, sign consent, and book an open time slot |
| `researcher` | Researcher | A verified researcher. Edit studies, review applicants, and define time slots |
| `pending` | Researcher | An unverified researcher. The dashboard says the account is awaiting approval |
| `admin` | Admin | Approve or revoke researchers, and open the email log |

Sign out between accounts. Use these four logins. A brand-new sign-up cannot receive a confirmation email in this demo, and uploading a consent PDF needs storage that is not connected. Signing consent by typing your name still works.

Everyone else in the dataset is synthetic and cannot sign in.

---

## What each person does

**A student** searches by study, condition, school, or city, filters by phase and status, and opens a card. The card shows the study title, school, compensation, and city. After signing in they enter a date of birth. The app accepts the application only when their age meets the study minimum. They type their name, check the consent box, and the app records the time and the consent version. After a researcher accepts them, they pick one open time slot.

**A researcher** must be approved by an admin before a study is public. A verified researcher creates or edits a study, sets future time slots, and accepts or rejects each applicant once. Acceptance sends an email. A daily job reminds the participant the day before the appointment, once per visit.

**An admin** approves or revokes researchers. Revoking a researcher hides that person's studies. The admin email log is at `/admin/emails`.

---

## Why this exists

Clinical research needs participants. Students often cannot find studies, cannot tell what they will be paid, and do not understand how their data is used. Researchers still recruit with flyers and scattered lists. MassRecruit makes the offer visible and the sign-up path short, starting with universities across Massachusetts and a demo seeded from UMass Boston outward.

The people and studies in the demo are **synthetic**, built from the dataset provided for Hackachusetts.

---

## How a visit moves through the app

```
Anyone
  Landing page → Continue → study cards (title, school, pay, city)
        │ open a card
        ▼
  Study page: description, eligibility, pay, data-use notice
        │ Sign in (username + password, pick a role)
        ▼
Student                         Verified researcher              Admin
  Apply with date of birth        Create the study                 Approve researchers
  Sign consent                    Accept or reject                 Revoke hides their studies
  Book one open slot              Define time slots
        │
        ▼
  The day before the visit, one reminder email goes out
```

---

## Built with

| | |
|---|---|
| App | Next.js 15 (App Router), TypeScript, React 19 |
| Look | Tailwind CSS, light theme and a dark theme |
| Data | Prisma and PostgreSQL. Locally the database starts from npm. The live site uses Neon |
| Sign-in | Username and password. `.edu` emails only |
| Mail and schedule | Resend for messages. Vercel Cron for the daily reminder |
| Hosting | https://massrecruit.vercel.app/ on Vercel |
| Tests | Vitest, fast-check, and Playwright |

Field-level data model and routes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Run it on your laptop

You need Node.js 20+ and npm. You do not need to install PostgreSQL yourself.

```bash
git clone https://github.com/Avanith12/MassRecruit.git
cd MassRecruit
npm install
cp .env.example .env
```

In `.env`, set `AUTH_SECRET` and `CRON_SECRET` to long random strings (`openssl rand -hex 32`).

```bash
# Terminal 1 — leave this running
npm run db:start

# Terminal 2
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open http://localhost:3000. On your laptop the four demo usernames use the password `password123`. That password works only for a local database.

The mock studies are already in [`data/massrecruit_mock_data.csv`](data/massrecruit_mock_data.csv): 20 Massachusetts universities, 200 study rows. `npm run db:seed` loads them.

```bash
npm test            # unit, property, and database tests
npm run test:e2e    # browser tests
npm run typecheck
```

Copy every variable you need from [`.env.example`](.env.example). Never commit `.env`.

---

## Built with Kiro

The `/.kiro` folder is part of the project and must stay in the repository.

- **Kiro IDE** was used to brainstorm the problem, the path from finding a study to the reminder, and the rules that do not bend: `.edu` only, researchers approved by an admin, and no double-booking.
- **Kiro CLI** wrote the spec, generated the app, and ran typecheck, tests, and the production build.
- Specs, steering docs, and hooks live in [`.kiro/`](.kiro/). Property-based tests caught a real search bug: a school name with a doubled space failed to match.
- Kiro Web, Kiro Crew, MCP, and Kiro Powers were not used.

---

## Team

| Name | Role |
|---|---|
| Jiehyun Kim | Developer |
| Ana Fahlboeck | Developer |
| Avanith Kanamarlapudi | Developer and team representative |

---

## Privacy

The app asks for a name, a `.edu` email, and a date of birth. It does not ask for an ID photo. Sign-up is limited to `.edu` addresses. A data-use notice is on every study page. All demo records are synthetic.

---

## License

MIT. See [`LICENSE`](LICENSE).

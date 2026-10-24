"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { clientIp, createSession, destroySession, getCurrentUser, homeFor, type CurrentUser } from "@/lib/session";
import { parseDateOnly, zonedWallTimeToUtc } from "@/lib/rules";
import * as svc from "@/lib/services";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/** Run a service call, mapping ServiceError to a form error. Other errors (incl. redirects) propagate. */
async function attempt(fn: () => Promise<unknown>, ok?: string): Promise<ActionState> {
  try {
    await fn();
    return { ok, at: Date.now() };
  } catch (e) {
    if (e instanceof svc.ServiceError) return { error: e.message, at: Date.now() };
    throw e;
  }
}

async function actor(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Only allow same-site relative redirects. */
function safeNext(next: string): string | null {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

// ---------------------------------------------------------------- auth

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let user: Awaited<ReturnType<typeof svc.authenticate>> | undefined;
  const ip = await clientIp();
  const res = await attempt(async () => {
    await svc.enforceRateLimit("login", ip);
    user = await svc.authenticate(str(fd, "username"), str(fd, "password"), str(fd, "role"));
  });
  if (res?.error || !user) return res;
  await createSession(user);
  redirect(safeNext(str(fd, "next")) ?? homeFor(user.role));
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "password") !== str(fd, "confirm")) return { error: "Passwords do not match." };
  let user: Awaited<ReturnType<typeof svc.registerUser>> | undefined;
  const ip = await clientIp();
  const res = await attempt(async () => {
    await svc.enforceRateLimit("register", ip);
    user = await svc.registerUser({
      role: str(fd, "role"),
      username: str(fd, "username"),
      password: str(fd, "password"),
      name: str(fd, "name"),
      email: str(fd, "email"),
      schoolId: str(fd, "schoolId") || undefined,
      departmentName: str(fd, "department"),
      phone: str(fd, "phone"),
    });
  });
  if (res?.error || !user) return res;
  await createSession(user);
  redirect(homeFor(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

// ---------------------------------------------------------------- student

export async function applyAction(studyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const res = await attempt(async () => {
    await svc.enforceRateLimit("apply", me.id);
    await svc.applyToStudy(me, studyId, {
      name: str(fd, "name"),
      dateOfBirth: parseDateOnly(str(fd, "dob")),
      consentChecked: fd.get("consent") === "on",
      signedName: str(fd, "signature"),
    });
  });
  if (res?.error) return res;
  revalidatePath(`/studies/${studyId}`);
  redirect("/student?applied=1");
}

export async function bookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const res = await attempt(() => svc.bookSlot(me, str(fd, "applicationId"), str(fd, "slotId")), "Appointment booked! A confirmation email is on its way.");
  revalidatePath("/student");
  return res;
}

// ---------------------------------------------------------------- researcher

async function studyInput(fd: FormData): Promise<svc.StudyInput> {
  const file = fd.get("consentPdf");
  const consentPdf = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : null;
  return {
    consentPdf,
    removeConsentPdf: fd.get("removeConsentPdf") === "on",
    name: str(fd, "name"),
    condition: str(fd, "condition"),
    city: str(fd, "city"),
    phase: str(fd, "phase"),
    status: str(fd, "status"),
    irbId: str(fd, "irbId"),
    compensationType: str(fd, "compensationType"),
    compensationDetails: str(fd, "compensationDetails"),
    description: str(fd, "description"),
    eligibility: str(fd, "eligibility"),
    minAge: str(fd, "minAge"),
    consentText: str(fd, "consentText"),
  };
}

export async function createStudyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  let id = "";
  const res = await attempt(async () => {
    id = (await svc.createStudy(me, await studyInput(fd))).id;
  });
  if (res?.error) return res;
  revalidatePath("/studies");
  redirect(`/researcher/studies/${id}?created=1`);
}

export async function updateStudyAction(studyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const input = await studyInput(fd);
  const res = await attempt(() => svc.updateStudy(me, studyId, input), "Study saved.");
  revalidatePath(`/researcher/studies/${studyId}`);
  revalidatePath(`/studies/${studyId}`);
  revalidatePath("/studies");
  return res;
}

export async function addSlotAction(studyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const date = str(fd, "date");
  const res = await attempt(
    () => svc.addSlot(me, studyId, zonedWallTimeToUtc(`${date}T${str(fd, "start")}`), zonedWallTimeToUtc(`${date}T${str(fd, "end")}`)),
    "Slot added.",
  );
  revalidatePath(`/researcher/studies/${studyId}`);
  return res;
}

export async function deleteSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const res = await attempt(() => svc.deleteSlot(me, str(fd, "slotId")));
  revalidatePath(`/researcher/studies/${str(fd, "studyId")}`);
  return res;
}

export async function decideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const decision = str(fd, "decision");
  const res = await attempt(
    () => svc.decideApplication(me, str(fd, "applicationId"), decision),
    decision === "ACCEPTED" ? "Accepted — the participant was emailed." : "Rejected — the participant was notified.",
  );
  revalidatePath(`/researcher/studies/${str(fd, "studyId")}`);
  return res;
}

// ---------------------------------------------------------------- admin

export async function verifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await actor();
  const verified = str(fd, "verified") === "true";
  const res = await attempt(() => svc.setResearcherVerified(me, str(fd, "userId"), verified), verified ? "Researcher approved." : "Verification revoked.");
  revalidatePath("/admin");
  revalidatePath("/studies");
  return res;
}

// ---------------------------------------------------------------- email verification

export async function verifyEmailAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let user: Awaited<ReturnType<typeof svc.verifyEmailToken>> | undefined;
  const res = await attempt(async () => {
    await svc.enforceRateLimit("verify", await clientIp());
    user = await svc.verifyEmailToken(str(fd, "token"));
  });
  if (res?.error || !user) return res;
  redirect(`${homeFor(user.role)}?verified=1`);
}

export async function resendVerificationAction(_: ActionState): Promise<ActionState> {
  const me = await actor();
  return attempt(async () => {
    await svc.enforceRateLimit("resend", me.id);
    await svc.sendVerificationEmail(me.id);
  }, `We sent a new link to ${me.email}.`);
}

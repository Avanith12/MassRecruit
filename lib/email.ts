// Email delivery via the Resend HTTP API. Without RESEND_API_KEY, messages are
// printed to the server console. Every message is recorded in the EmailLog table
// (viewable by admins at /admin/emails) so delivery can be verified in demos.
import { db } from "./db";

export type Email = {
  to: string;
  subject: string;
  text: string;
  /** Secrets (e.g. one-time tokens) to mask in the stored log once the email is really delivered. */
  redact?: string[];
};

/** In-memory copy of sent messages — test runs only. */
export const outbox: Email[] = [];

async function record(msg: Email, status: "SENT" | "DEV_LOGGED" | "FAILED", error?: string) {
  // In dev (no provider) the log *is* the delivery channel, so keep it readable;
  // for real deliveries, mask secrets so the log can't be used to take over accounts.
  let text = msg.text;
  if (status !== "DEV_LOGGED") for (const r of msg.redact ?? []) text = text.split(r).join("[redacted]");
  try {
    await db.emailLog.create({ data: { to: msg.to, subject: msg.subject, text, status, error: error?.slice(0, 1000) } });
  } catch (e) {
    console.error("[email] failed to write EmailLog", e); // never block the user action on logging
  }
}

export async function sendEmail(msg: Email): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NODE_ENV === "test") outbox.push(msg);
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "test") console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}\n`);
    await record(msg, "DEV_LOGGED");
    return { ok: true };
  }
  let error: string | undefined;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "MassRecruit <onboarding@resend.dev>",
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) error = `Resend ${res.status}: ${await res.text()}`;
  } catch (e) {
    error = String(e);
  }
  if (error) console.error(`[email] send failed to=${msg.to}: ${error}`);
  await record(msg, error ? "FAILED" : "SENT", error);
  return error ? { ok: false, error } : { ok: true };
}

export function appUrl(path = ""): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "") + path;
}

// Email delivery via the Resend HTTP API. Without RESEND_API_KEY, messages are
// logged and kept in an in-memory outbox (used by tests and local dev).

export type Email = { to: string; subject: string; text: string };

export const outbox: Email[] = [];

export async function sendEmail(msg: Email): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    outbox.push(msg);
    if (process.env.NODE_ENV !== "test") {
      console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}\n`);
    }
    return { ok: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "MassRecruit <onboarding@resend.dev>",
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function appUrl(path = ""): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}

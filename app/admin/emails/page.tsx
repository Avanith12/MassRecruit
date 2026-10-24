import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/rules";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EmailLogPage() {
  await requireRole("ADMIN");
  const emails = await db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const live = !!process.env.RESEND_API_KEY;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm">← Researcher verification</Link>
        <h1 className="mt-2 text-2xl font-bold">Admin · Email log</h1>
        <p className="text-sm text-slate-600">
          {live
            ? "Emails are delivered through Resend."
            : "RESEND_API_KEY is not set, so emails are recorded here and printed to the server console instead of being delivered."}{" "}
          Showing the latest 200.
        </p>
      </div>
      <Card>
        {emails.length === 0 ? (
          <p className="text-sm text-slate-600">No emails yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {emails.map((e) => (
              <li key={e.id} className="py-3" data-testid="email-log">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <Badge tone={e.status === "FAILED" ? "red" : e.status === "SENT" ? "green" : "slate"}>
                      {e.status === "DEV_LOGGED" ? "logged (dev)" : e.status.toLowerCase()}
                    </Badge>
                    <span className="font-medium">{e.subject}</span>
                    <span className="text-slate-500">→ {e.to}</span>
                    <span className="ml-auto text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs">{e.text}</pre>
                  {e.error && <p className="mt-1 text-xs text-red-700">{e.error}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

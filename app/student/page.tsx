import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatDay, formatDateTime } from "@/lib/rules";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Button, Card, statusTone } from "@/components/ui";
import { bookAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function StudentDashboard({ searchParams }: { searchParams: Promise<{ applied?: string; verified?: string }> }) {
  const me = await requireRole("STUDENT");
  const { applied, verified } = await searchParams;
  const now = new Date();
  const apps = await db.application.findMany({
    where: { participantId: me.id },
    orderBy: { submittedAt: "desc" },
    include: {
      booking: { include: { slot: true } },
      study: {
        select: {
          id: true, name: true, city: true, compensationDetails: true,
          researcher: { select: { verified: true } },
          slots: { where: { isBooked: false, startTime: { gt: now } }, orderBy: { startTime: "asc" }, take: 50 },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hi, {me.name.split(" ")[0]}</h1>
        <p className="text-slate-600">Your study applications and appointments.</p>
      </div>
      {verified && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Email confirmed — you can now apply to studies.
        </p>
      )}
      {applied && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Application submitted! The research team will review it and you&apos;ll get an email when they decide.
        </p>
      )}

      {apps.length === 0 ? (
        <Card>
          <p>You haven&apos;t applied to any studies yet.</p>
          <Link href="/studies" className="mt-2 inline-block">Browse studies →</Link>
        </Card>
      ) : (
        <ul className="space-y-4">
          {apps.map((a) => (
            <li key={a.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/studies/${a.study.id}`} className="font-semibold">{a.study.name}</Link>
                    <p className="text-sm text-slate-600">
                      {a.study.city} · {a.study.compensationDetails} · applied {formatDay(a.submittedAt)} · consent v{a.consentVersionSigned}
                    </p>
                  </div>
                  <Badge tone={statusTone(a.status)}>{a.status.toLowerCase()}</Badge>
                </div>

                {a.status === "ACCEPTED" && a.booking && (
                  <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm" data-testid="booked-time">
                    📅 Appointment: <strong>{formatDateTime(a.booking.slot.startTime)}</strong>
                    {a.booking.reminderSentAt ? " · reminder sent" : " · you'll get a reminder the day before"}
                  </p>
                )}

                {a.status === "ACCEPTED" && !a.booking && !a.study.researcher.verified && (
                  <p className="mt-3 text-sm text-slate-600">This study is temporarily unavailable for booking.</p>
                )}

                {a.status === "ACCEPTED" && !a.booking && a.study.researcher.verified && (
                  <div className="mt-3">
                    {a.study.slots.length === 0 ? (
                      <p className="text-sm text-slate-600">You&apos;re accepted! No open time slots yet — check back soon.</p>
                    ) : (
                      <ActionForm action={bookAction} aria-label={`Book a slot for ${a.study.name}`}>
                        <input type="hidden" name="applicationId" value={a.id} />
                        <fieldset>
                          <legend className="text-sm font-medium">You&apos;re accepted! Pick a time:</legend>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {a.study.slots.map((s) => (
                              <label key={s.id} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                                <input type="radio" name="slotId" value={s.id} required />
                                {formatDateTime(s.startTime)}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <Button className="mt-3">Book this time</Button>
                      </ActionForm>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

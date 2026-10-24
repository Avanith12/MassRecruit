import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ageOn, formatDate, formatDateTime, zonedDateKey } from "@/lib/rules";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Button, Card, Field, Input, statusTone } from "@/components/ui";
import { addSlotAction, decideAction, deleteSlotAction, updateStudyAction } from "@/app/actions";
import { StudyForm } from "../../StudyForm";

export const dynamic = "force-dynamic";

export default async function ManageStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const me = await requireRole("RESEARCHER");
  if (!me.verified) redirect("/researcher");
  const { id } = await params;
  const { created } = await searchParams;
  const study = await db.study.findUnique({
    where: { id },
    include: {
      consentForm: true,
      slots: { orderBy: { startTime: "asc" }, include: { booking: { include: { application: { select: { name: true } } } } } },
      applications: { orderBy: [{ status: "asc" }, { submittedAt: "desc" }], include: { booking: { include: { slot: true } } } },
    },
  });
  if (!study || study.researcherId !== me.id) notFound();
  const now = new Date();
  const tomorrow = zonedDateKey(new Date(now.getTime() + 24 * 3600_000));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/researcher" className="text-sm">← Dashboard</Link>
        <h1 className="mt-2 text-2xl font-bold">{study.name}</h1>
        <p className="text-sm">
          <Link href={`/studies/${study.id}`}>View public page</Link>
        </p>
      </div>
      {created && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Study published. Add availability slots so accepted participants can book.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Applicants ({study.applications.length})</h2>
          {study.applications.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No applications yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {study.applications.map((a) => (
                <li key={a.id} className="py-3" data-testid="applicant">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-slate-600">
                        {a.email} · age {ageOn(a.dateOfBirth, now)} · signed &ldquo;{a.consentSignedName}&rdquo; (v{a.consentVersionSigned}) on{" "}
                        {formatDate(a.consentSignedAt)}
                      </p>
                      {a.booking && <p className="mt-1 text-xs">📅 {formatDateTime(a.booking.slot.startTime)}</p>}
                    </div>
                    <Badge tone={statusTone(a.status)}>{a.status.toLowerCase()}</Badge>
                  </div>
                  {a.status === "PENDING" && (
                    <div className="mt-2 flex gap-2">
                      {(["ACCEPTED", "REJECTED"] as const).map((d) => (
                        <ActionForm key={d} action={decideAction} aria-label={`${d === "ACCEPTED" ? "Accept" : "Reject"} ${a.name}`}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <input type="hidden" name="studyId" value={study.id} />
                          <input type="hidden" name="decision" value={d} />
                          <Button variant={d === "ACCEPTED" ? "primary" : "secondary"} className="px-3 py-1 text-xs">
                            {d === "ACCEPTED" ? "Accept" : "Reject"}
                          </Button>
                        </ActionForm>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Availability slots</h2>
          <p className="text-xs text-slate-500">Times are Eastern (Boston).</p>
          <ActionForm action={addSlotAction.bind(null, study.id)} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" aria-label="Add slot" resetOnSuccess>
            <Field label="Date"><Input name="date" type="date" required min={tomorrow} /></Field>
            <Field label="Start"><Input name="start" type="time" required /></Field>
            <Field label="End"><Input name="end" type="time" required /></Field>
            <Button>Add</Button>
          </ActionForm>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {study.slots.length === 0 && <li className="py-2 text-slate-600">No slots yet.</li>}
            {study.slots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2" data-testid="slot">
                <span className={s.startTime < now ? "text-slate-400" : ""}>
                  {formatDateTime(s.startTime)} – {s.endTime.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}
                </span>
                {s.booking ? (
                  <Badge tone="blue">booked · {s.booking.application.name}</Badge>
                ) : (
                  <ActionForm action={deleteSlotAction} confirm="Delete this slot?" aria-label="Delete slot">
                    <input type="hidden" name="slotId" value={s.id} />
                    <input type="hidden" name="studyId" value={study.id} />
                    <Button variant="secondary" className="px-2 py-1 text-xs">Delete</Button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Edit study</h2>
        <StudyForm
          action={updateStudyAction.bind(null, study.id)}
          submitLabel="Save changes"
          defaults={{ ...study, consentText: study.consentForm?.text ?? "", consentVersion: study.consentForm?.version }}
        />
      </Card>
    </div>
  );
}

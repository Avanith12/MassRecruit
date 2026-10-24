import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { publicStudyWhere } from "@/lib/services";
import { PHASE_LABELS, formatDate } from "@/lib/rules";
import { Badge, Card, statusTone } from "@/components/ui";
import { ApplyForm } from "./ApplyForm";

export const dynamic = "force-dynamic";

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const study = await db.study.findFirst({
    where: {
      id,
      // Owners can preview their own study even before verification.
      OR: [publicStudyWhere, ...(user ? [{ researcherId: user.id }] : [])],
    },
    include: {
      consentForm: true,
      researcher: { select: { name: true, email: true, phone: true, verified: true, school: true, department: true } },
    },
  });
  if (!study) notFound();

  const existing =
    user?.role === "STUDENT"
      ? await db.application.findUnique({ where: { studyId_participantId: { studyId: study.id, participantId: user.id } } })
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <article className="space-y-6">
        <div>
          <Link href="/" className="text-sm">← All studies</Link>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={statusTone(study.status)}>{study.status === "RECRUITING" ? "Recruiting" : "Closed"}</Badge>
            <Badge>{PHASE_LABELS[study.phase] ?? study.phase}</Badge>
            <Badge tone="blue">{study.condition}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold">{study.name}</h1>
          <p className="text-slate-600">
            {study.researcher.school?.name ?? "Independent"} · {study.city}
          </p>
        </div>

        <Card>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-500">Compensation</dt>
              <dd className="font-semibold text-green-800">{study.compensationDetails}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Location</dt>
              <dd className="font-semibold">{study.city}, MA</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Eligibility</dt>
              <dd>{study.eligibility}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">IRB ID</dt>
              <dd className="font-mono text-sm">{study.irbId}</dd>
            </div>
          </dl>
        </Card>

        <section>
          <h2 className="text-lg font-semibold">About this study</h2>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{study.description}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2">
            {study.researcher.name}
            {study.researcher.department && <> · {study.researcher.department.name}</>}
            <br />
            <a href={`mailto:${study.researcher.email}`}>{study.researcher.email}</a>
            {study.researcher.phone && <> · {study.researcher.phone}</>}
          </p>
        </section>

        <section aria-labelledby="data-use" className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm">
          <h2 id="data-use" className="font-semibold text-brand-800">How your data is used</h2>
          <p className="mt-1">
            When you apply we share your name, .edu email, and date of birth with this study&apos;s research team only. Your date of
            birth is used to confirm the age requirement. We record your consent signature, the time you signed, and the consent
            form version. MassRecruit never sells your data.
          </p>
        </section>
      </article>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <h2 className="text-lg font-semibold">Join this study</h2>
          {study.status !== "RECRUITING" ? (
            <p className="mt-2 text-slate-600">This study is closed and not accepting new participants.</p>
          ) : !user ? (
            <div className="mt-2 space-y-3">
              <p className="text-slate-600">Sign in with your student account to apply.</p>
              <Link
                href={`/login?next=${encodeURIComponent(`/studies/${study.id}`)}`}
                className="inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700 hover:no-underline"
              >
                Sign in to apply
              </Link>
            </div>
          ) : user.role !== "STUDENT" ? (
            <p className="mt-2 text-slate-600">Only student accounts can apply to studies.</p>
          ) : existing ? (
            <div className="mt-2 space-y-2">
              <p>
                You applied on {formatDate(existing.submittedAt)}. Status:{" "}
                <Badge tone={statusTone(existing.status)}>{existing.status.toLowerCase()}</Badge>
              </p>
              <Link href="/student">Go to my dashboard →</Link>
            </div>
          ) : !study.consentForm ? (
            <p className="mt-2 text-slate-600">This study isn&apos;t accepting applications yet.</p>
          ) : (
            <ApplyForm
              studyId={study.id}
              defaultName={user.name}
              defaultEmail={user.email}
              minAge={study.minAge}
              consentText={study.consentForm.text}
              consentVersion={study.consentForm.version}
              consentUrl={study.consentForm.fileUrl}
            />
          )}
        </Card>
      </aside>
    </div>
  );
}

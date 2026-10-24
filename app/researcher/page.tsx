import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { Badge, Card, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ResearcherDashboard() {
  const me = await requireRole("RESEARCHER");
  const studies = me.verified
    ? await db.study.findMany({
        where: { researcherId: me.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { applications: { where: { status: "PENDING" } }, slots: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Researcher dashboard</h1>
          <p className="text-slate-600">{me.name}</p>
        </div>
        {me.verified && (
          <Link href="/researcher/studies/new" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700 hover:no-underline">
            + New study
          </Link>
        )}
      </div>

      {!me.verified ? (
        <Card className="border-amber-300 bg-amber-50">
          <h2 className="font-semibold text-amber-900">Awaiting admin verification</h2>
          <p className="mt-1 text-sm text-amber-900">
            An admin needs to verify your researcher account before you can post studies. You&apos;ll receive an email once
            you&apos;re approved.
          </p>
        </Card>
      ) : studies.length === 0 ? (
        <Card>You haven&apos;t posted any studies yet.</Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {studies.map((s) => (
            <li key={s.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/researcher/studies/${s.id}`} className="font-semibold">{s.name}</Link>
                  <Badge tone={statusTone(s.status)}>{s.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {s.city} · {s.compensationDetails}
                </p>
                <p className="mt-2 text-sm">
                  <strong>{s._count.applications}</strong> pending applicant{s._count.applications === 1 ? "" : "s"} ·{" "}
                  {s._count.slots} slot{s._count.slots === 1 ? "" : "s"}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

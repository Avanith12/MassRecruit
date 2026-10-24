import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatDate } from "@/lib/rules";
import { ActionForm } from "@/components/ActionForm";
import { Button, Card } from "@/components/ui";
import { verifyAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole("ADMIN");
  const researchers = await db.user.findMany({
    where: { role: "RESEARCHER" },
    orderBy: [{ verified: "asc" }, { createdAt: "desc" }],
    include: { school: true, department: true, _count: { select: { studies: true } } },
  });
  const pending = researchers.filter((r) => !r.verified);
  const verified = researchers.filter((r) => r.verified);

  const Row = ({ r }: { r: (typeof researchers)[number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={r.verified ? "verified-researcher" : "pending-researcher"}>
      <div>
        <p className="font-medium">
          {r.name} <span className="text-sm font-normal text-slate-500">@{r.username}</span>
        </p>
        <p className="text-xs text-slate-600">
          {r.email} · {r.school?.name ?? "No school"}
          {r.department && ` · ${r.department.name}`} · joined {formatDate(r.createdAt)} · {r._count.studies} studies
        </p>
      </div>
      <ActionForm action={verifyAction} aria-label={`${r.verified ? "Revoke" : "Approve"} ${r.username}`}
        confirm={r.verified ? `Revoke verification for ${r.name}? Their studies will be hidden from the public.` : undefined}>
        <input type="hidden" name="userId" value={r.id} />
        <input type="hidden" name="verified" value={r.verified ? "false" : "true"} />
        <Button variant={r.verified ? "secondary" : "primary"} className="px-3 py-1 text-xs">
          {r.verified ? "Revoke" : "Approve"}
        </Button>
      </ActionForm>
    </li>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin · Researcher verification</h1>
      <Card>
        <h2 className="text-lg font-semibold">Awaiting verification ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No researchers waiting. 🎉</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">{pending.map((r) => <Row key={r.id} r={r} />)}</ul>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Verified researchers ({verified.length})</h2>
        <ul className="mt-2 max-h-[600px] divide-y divide-slate-100 overflow-y-auto">{verified.map((r) => <Row key={r.id} r={r} />)}</ul>
      </Card>
    </div>
  );
}

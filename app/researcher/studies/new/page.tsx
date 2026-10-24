import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Card } from "@/components/ui";
import { createStudyAction } from "@/app/actions";
import { StudyForm } from "../../StudyForm";

export const dynamic = "force-dynamic";

export default async function NewStudyPage() {
  const me = await requireRole("RESEARCHER");
  if (!me.verified) redirect("/researcher");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/researcher" className="text-sm">← Dashboard</Link>
      <h1 className="text-2xl font-bold">Post a new study</h1>
      <Card>
        <StudyForm action={createStudyAction} submitLabel="Publish study" />
      </Card>
    </div>
  );
}

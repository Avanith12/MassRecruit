import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, homeFor } from "@/lib/session";
import { Card } from "@/components/ui";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const { role } = await searchParams;
  const schools = await db.school.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Create your account</h1>
      <Card>
        <RegisterForm schools={schools} initialRole={role ?? "STUDENT"} />
      </Card>
    </div>
  );
}

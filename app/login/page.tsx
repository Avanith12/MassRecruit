import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/session";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
      <Card>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </Card>
    </div>
  );
}

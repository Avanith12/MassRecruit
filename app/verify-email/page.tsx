import Link from "next/link";
import { getCurrentUser, homeFor } from "@/lib/session";
import { Card } from "@/components/ui";
import { ConfirmForm, ResendForm } from "./forms";

export const dynamic = "force-dynamic";

/**
 * Landing page for the emailed link. Confirmation needs a button press (POST), so
 * email link scanners that pre-fetch URLs can't consume the one-time token.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Confirm your email</h1>
      <Card>
        {typeof token === "string" && token ? (
          <div className="space-y-4">
            <p>Click below to confirm this email address for your MassRecruit account.</p>
            <ConfirmForm token={token} />
          </div>
        ) : user?.emailVerifiedAt ? (
          <p>
            Your email is confirmed. <Link href={homeFor(user.role)}>Go to your dashboard →</Link>
          </p>
        ) : user ? (
          <div className="space-y-4">
            <p>
              We sent a confirmation link to <strong>{user.email}</strong>. Open it to finish setting up your account — you
              need a confirmed email to apply to studies{user.role === "ADMIN" ? " or use admin tools" : ""}.
            </p>
            <ResendForm />
          </div>
        ) : (
          <p>
            Open the link from your confirmation email, or <Link href="/login">sign in</Link> to request a new one.
          </p>
        )}
      </Card>
    </div>
  );
}

"use client";

import { ActionForm } from "@/components/ActionForm";
import { Button } from "@/components/ui";
import { resendVerificationAction, verifyEmailAction } from "@/app/actions";

export function ConfirmForm({ token }: { token: string }) {
  return (
    <ActionForm action={verifyEmailAction} aria-label="Confirm email">
      <input type="hidden" name="token" value={token} />
      <Button className="w-full">Confirm my email</Button>
    </ActionForm>
  );
}

export function ResendForm() {
  return (
    <ActionForm action={resendVerificationAction} aria-label="Resend verification email">
      <Button variant="secondary">Resend the link</Button>
    </ActionForm>
  );
}

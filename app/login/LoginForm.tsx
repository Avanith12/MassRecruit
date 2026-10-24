"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Button, Field, Input } from "@/components/ui";
import { loginAction } from "@/app/actions";

const ROLES = [
  { value: "STUDENT", label: "Student", blurb: "Find and join research studies" },
  { value: "RESEARCHER", label: "Researcher", blurb: "Post studies and manage participants" },
  { value: "ADMIN", label: "Admin", blurb: "Verify researcher accounts" },
] as const;

export function LoginForm({ next }: { next: string }) {
  const [role, setRole] = useState<string>("STUDENT");
  return (
    <ActionForm action={loginAction} className="space-y-5" aria-label="Sign in">
      <fieldset>
        <legend className="text-sm font-medium">I am signing in as a…</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className={`cursor-pointer rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 ${
                role === r.value ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
                className="sr-only"
              />
              <span className="block font-semibold">{r.label}</span>
              <span className="block text-xs text-slate-600">{r.blurb}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <input type="hidden" name="next" value={next} />
      <Field label="Username">
        <Input name="username" required autoComplete="username" autoCapitalize="none" />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      <Button className="w-full">Sign in</Button>
      {role !== "ADMIN" && (
        <p className="text-center text-sm text-slate-600">
          New here? <Link href={`/register?role=${role}`}>Create a {role === "STUDENT" ? "student" : "researcher"} account</Link>
        </p>
      )}
    </ActionForm>
  );
}

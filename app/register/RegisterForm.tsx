"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Button, Field, Input, Select } from "@/components/ui";
import { registerAction } from "@/app/actions";

export function RegisterForm({ schools, initialRole }: { schools: { id: string; name: string }[]; initialRole: string }) {
  const [role, setRole] = useState(initialRole === "RESEARCHER" ? "RESEARCHER" : "STUDENT");
  return (
    <ActionForm action={registerAction} className="space-y-4" aria-label="Create account">
      <fieldset>
        <legend className="text-sm font-medium">Account type</legend>
        <div className="mt-2 flex gap-4 text-sm">
          {(["STUDENT", "RESEARCHER"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              {r === "STUDENT" ? "Student" : "Researcher"}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Full name">
        <Input name="name" required autoComplete="name" />
      </Field>
      <Field label="University email" hint="Must be a .edu address.">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Username" hint="3–30 characters: letters, numbers, . _ -">
        <Input name="username" required autoComplete="username" autoCapitalize="none" pattern="[A-Za-z0-9._\-]{3,30}" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" hint="At least 8 characters.">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password">
          <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
      </div>
      {role === "RESEARCHER" && (
        <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Researcher accounts must be verified by an admin before you can post studies.
          </p>
          <Field label="School">
            <Select name="schoolId" required defaultValue="">
              <option value="" disabled>Select your school…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Input name="department" required />
          </Field>
          <Field label="Phone (optional)">
            <Input name="phone" type="tel" autoComplete="tel" />
          </Field>
        </div>
      )}
      <Button className="w-full">Create account</Button>
      <p className="text-center text-sm text-slate-600">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </ActionForm>
  );
}

"use client";

import { ActionForm } from "@/components/ActionForm";
import { Button, Field, Input } from "@/components/ui";
import { applyAction } from "@/app/actions";

export function ApplyForm(props: {
  studyId: string;
  defaultName: string;
  defaultEmail: string;
  minAge: number;
  consentText: string;
  consentVersion: number;
  consentUrl: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={applyAction.bind(null, props.studyId)} className="mt-3 space-y-4" aria-label="Apply to study">
      <Field label="Full name">
        <Input name="name" required defaultValue={props.defaultName} autoComplete="name" />
      </Field>
      <Field label="Email (.edu)">
        <Input name="email" type="email" required defaultValue={props.defaultEmail} autoComplete="email" />
      </Field>
      <Field label="Date of birth" hint={`You must be at least ${props.minAge}.`}>
        <Input name="dob" type="date" required max={today} autoComplete="bday" />
      </Field>

      <div>
        <p className="text-sm font-medium">Consent form (version {props.consentVersion})</p>
        <div
          tabIndex={0}
          aria-label="Consent form text"
          className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed"
        >
          {props.consentText}
        </div>
        {props.consentUrl && (
          <a href={props.consentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs">
            View full consent PDF
          </a>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>I have read the consent form and agree to participate.</span>
      </label>
      <Field label="Type your full name to sign" hint="Your signature, the time, and the consent version are recorded.">
        <Input name="signature" required />
      </Field>
      <Button className="w-full">Sign &amp; apply</Button>
    </ActionForm>
  );
}

"use client";

import { ActionForm, type ActionState } from "@/components/ActionForm";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { COMPENSATION_TYPES, PHASES, PHASE_LABELS } from "@/lib/rules";

export type StudyDefaults = {
  name: string; condition: string; city: string; phase: string; status: string; irbId: string;
  compensationType: string; compensationDetails: string; description: string; eligibility: string;
  minAge: number; consentText: string; consentVersion?: number; consentPdfUrl?: string | null;
};

const EMPTY: StudyDefaults = {
  name: "", condition: "", city: "Boston", phase: "NA", status: "RECRUITING", irbId: "",
  compensationType: "GIFT_CARD", compensationDetails: "", description: "", eligibility: "Age 18+",
  minAge: 18, consentText: "",
};

export function StudyForm({
  action,
  defaults = EMPTY,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: StudyDefaults;
  submitLabel: string;
}) {
  const d = defaults;
  return (
    <ActionForm action={action} className="space-y-4" aria-label="Study details">
      <Field label="Study name"><Input name="name" required defaultValue={d.name} maxLength={200} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Condition / topic"><Input name="condition" required defaultValue={d.condition} /></Field>
        <Field label="City"><Input name="city" required defaultValue={d.city} /></Field>
        <Field label="IRB ID"><Input name="irbId" required defaultValue={d.irbId} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Phase">
          <Select name="phase" defaultValue={d.phase}>
            {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={d.status}>
            <option value="RECRUITING">Recruiting</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </Field>
        <Field label="Minimum age"><Input name="minAge" type="number" min={18} max={99} required defaultValue={d.minAge} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Compensation type">
          <Select name="compensationType" defaultValue={d.compensationType}>
            {COMPENSATION_TYPES.map((c) => <option key={c} value={c}>{c === "GIFT_CARD" ? "Gift card" : c[0] + c.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
        <Field label="Compensation details" hint='e.g. "$25 gift card"'>
          <Input name="compensationDetails" required defaultValue={d.compensationDetails} />
        </Field>
      </div>
      <Field label="Description"><Textarea name="description" required rows={4} defaultValue={d.description} /></Field>
      <Field label="Eligibility (plain language)"><Input name="eligibility" required defaultValue={d.eligibility} /></Field>
      <Field
        label={`Consent form text${d.consentVersion ? ` (currently v${d.consentVersion})` : ""}`}
        hint="Editing this text creates a new consent version; each signature records the version agreed to."
      >
        <Textarea name="consentText" required rows={6} defaultValue={d.consentText} />
      </Field>
      <div className="space-y-2">
        <Field label="Consent PDF (optional)" hint="PDF, up to 5 MB. Uploading a new file also creates a new consent version.">
          <Input name="consentPdf" type="file" accept="application/pdf,.pdf" />
        </Field>
        {d.consentPdfUrl && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a href={d.consentPdfUrl} target="_blank" rel="noreferrer">Current consent PDF</a>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="removeConsentPdf" /> Remove PDF
            </label>
          </div>
        )}
      </div>
      <Button>{submitLabel}</Button>
    </ActionForm>
  );
}

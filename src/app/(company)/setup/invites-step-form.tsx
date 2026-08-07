"use client";

import { useActionState, useState } from "react";
import { Mail, Plus, X } from "lucide-react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import { Badge } from "@/components/ui/badge";
import { saveInvitesStep } from "@/features/setup/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { INVITABLE_ROLES } from "@/validations/team";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { StepBackLink } from "./company-step-form";

const MAX_ROWS = 5;

const ROLE_HELP: Record<(typeof INVITABLE_ROLES)[number], string> = {
  COMPANY_ADMIN: "Full control — team, settings, billing",
  HR_MANAGER: "Runs the org and employee records",
  ACCOUNTANT: "Processes payroll and payments",
};

export function InvitesStepForm() {
  const [state, formAction] = useActionState(saveInvitesStep, IDLE_FORM_STATE);
  const [rows, setRows] = useState<string[]>([""]);
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>("HR_MANAGER");

  const addRow = () => setRows((r) => (r.length < MAX_ROWS ? [...r, ""] : r));
  const removeRow = (index: number) => setRows((r) => r.filter((_, i) => i !== index));
  const setRow = (index: number, value: string) =>
    setRows((r) => r.map((v, i) => (i === index ? value : v)));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.message} />
      {state.fieldErrors?.emails?.map((msg) => (
        <p key={msg} role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-[13px] text-danger">
          {msg}
        </p>
      ))}
      {state.fieldErrors?.role?.[0] && (
        <FormError message={state.fieldErrors.role[0]} />
      )}

      <FormField
        label="Work emails"
        htmlFor="email-0"
        hint="Each person gets a link that expires in 7 days. Invitees set their own password."
      >
        <div className="flex flex-col gap-2">
          {rows.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  id={`email-${index}`}
                  name="email"
                  type="email"
                  value={value}
                  onChange={(e) => setRow(index, e.target.value)}
                  placeholder="teammate@company.com"
                  className="pl-9"
                />
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove row ${index + 1}`}
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-slate-100 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {rows.length < MAX_ROWS && (
            <button
              type="button"
              onClick={addRow}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-primary-600 transition-colors hover:bg-indigo-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add another
            </button>
          )}
        </div>
      </FormField>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink">
          They will join as <span className="text-danger">*</span>
        </legend>
        <input type="hidden" name="role" value={role} />
        <div className="grid gap-2 sm:grid-cols-2">
          {INVITABLE_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={cn(
                "rounded-lg border px-3.5 py-3 text-left transition-all",
                role === r
                  ? "border-primary-600 bg-indigo-50/60 ring-2 ring-indigo-100"
                  : "border-border bg-white hover:border-slate-300",
              )}
            >
              <span className="mb-1 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">{ROLE_LABELS[r]}</span>
                {role === r && <Badge variant="indigo">Selected</Badge>}
              </span>
              <span className="text-[12px] text-muted">{ROLE_HELP[r]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <StepBackLink href="/setup?step=3" />
        <div className="flex items-center gap-2">
          <SubmitButton name="skip" value="1" variant="secondary">
            Skip for now
          </SubmitButton>
          <SubmitButton size="md">Send invites</SubmitButton>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { saveOrgBasicsStep } from "@/features/setup/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { StepBackLink } from "./company-step-form";

const MAX_ROWS = 12;

export function OrgStepForm({ existingDepartments }: { existingDepartments: string[] }) {
  const [state, formAction] = useActionState(saveOrgBasicsStep, IDLE_FORM_STATE);
  const [rows, setRows] = useState<string[]>(["", "", ""]);

  const addRow = () => setRows((r) => (r.length < MAX_ROWS ? [...r, ""] : r));
  const removeRow = (index: number) => setRows((r) => r.filter((_, i) => i !== index));
  const setRow = (index: number, value: string) =>
    setRows((r) => r.map((v, i) => (i === index ? value : v)));

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.message} />
      {state.fieldErrors?.departments?.map((msg) => (
        <p key={msg} role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-[13px] text-danger">
          {msg}
        </p>
      ))}

      {existingDepartments.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Already created</p>
          <div className="flex flex-wrap gap-1.5">
            {existingDepartments.map((name) => (
              <Badge key={name} variant="green" dot>
                {name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <FormField
        label="Departments"
        htmlFor="department-0"
        hint="e.g. Operations, Finance, Engineering. Duplicates are ignored — you can refine everything later."
      >
        <div className="flex flex-col gap-2">
          {rows.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                id={`department-${index}`}
                name="department"
                value={value}
                onChange={(e) => setRow(index, e.target.value)}
                placeholder={index === 0 ? "e.g. Operations" : ""}
              />
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

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <StepBackLink href="/setup?step=2" />
        <div className="flex items-center gap-2">
          <SubmitButton name="skip" value="1" variant="secondary">
            Skip for now
          </SubmitButton>
          <SubmitButton size="md">Save and continue</SubmitButton>
        </div>
      </div>
    </form>
  );
}

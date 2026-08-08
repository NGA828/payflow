"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";

type ActionFn = (prev: FormState, formData: FormData) => Promise<FormState>;

export function PeriodForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
}: {
  action: ActionFn;
  defaults: { startDate: string; endDate: string; payDate: string; notes?: string };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  useSuccessToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <FormField label="Start date" htmlFor="startDate" required error={state.fieldErrors?.startDate?.[0]}>
          <Input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate} error={Boolean(state.fieldErrors?.startDate)} />
        </FormField>
        <FormField label="End date" htmlFor="endDate" required error={state.fieldErrors?.endDate?.[0]}>
          <Input id="endDate" name="endDate" type="date" defaultValue={defaults.endDate} error={Boolean(state.fieldErrors?.endDate)} />
        </FormField>
        <FormField label="Pay date" htmlFor="payDate" required error={state.fieldErrors?.payDate?.[0]} hint="When salaries should land.">
          <Input id="payDate" name="payDate" type="date" defaultValue={defaults.payDate} error={Boolean(state.fieldErrors?.payDate)} />
        </FormField>
      </div>
      <FormField label="Notes" htmlFor="notes" error={state.fieldErrors?.notes?.[0]}>
        <Input id="notes" name="notes" defaultValue={defaults.notes} maxLength={500} autoComplete="off" placeholder="Optional — e.g. includes year-end bonus" error={Boolean(state.fieldErrors?.notes)} />
      </FormField>

      <FormError message={state.message} />
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
          Cancel
        </Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

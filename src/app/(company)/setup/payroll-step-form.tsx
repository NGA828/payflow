"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import { savePayrollSettingsStep } from "@/features/setup/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { StepBackLink } from "./company-step-form";

export interface PayrollStepDefaults {
  payrollFrequency: string;
  standardHoursPerWeek: string;
  overtimeMultiplier: string;
  /** Already converted to percent for display (e.g. "0", "5"). */
  taxRatePercent: string;
}

export function PayrollStepForm({ defaults }: { defaults: PayrollStepDefaults }) {
  const [state, formAction] = useActionState(savePayrollSettingsStep, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.message} />

      <FormField
        label="Payroll frequency"
        htmlFor="payrollFrequency"
        required
        hint="Weekly and bi-weekly runs are on the roadmap."
      >
        <Select id="payrollFrequency" name="payrollFrequency" defaultValue={defaults.payrollFrequency}>
          <option value="MONTHLY">Monthly</option>
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Standard hours per week"
          htmlFor="standardHoursPerWeek"
          required
          hint="Used to derive hourly rates for overtime."
          error={state.fieldErrors?.standardHoursPerWeek?.[0]}
        >
          <Input
            id="standardHoursPerWeek"
            name="standardHoursPerWeek"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="1"
            max="60"
            defaultValue={defaults.standardHoursPerWeek}
            error={Boolean(state.fieldErrors?.standardHoursPerWeek)}
            required
          />
        </FormField>

        <FormField
          label="Overtime multiplier"
          htmlFor="overtimeMultiplier"
          required
          hint="1.2 × means overtime pays 20% above the hourly rate."
          error={state.fieldErrors?.overtimeMultiplier?.[0]}
        >
          <Input
            id="overtimeMultiplier"
            name="overtimeMultiplier"
            type="number"
            inputMode="decimal"
            step="0.05"
            min="1"
            max="5"
            defaultValue={defaults.overtimeMultiplier}
            error={Boolean(state.fieldErrors?.overtimeMultiplier)}
            required
          />
        </FormField>
      </div>

      <FormField
        label="Flat tax rate (%)"
        htmlFor="taxRatePercent"
        required
        hint="Applied to gross pay in the payroll engine. Set 0 to calculate PAYE manually per payslip."
        error={state.fieldErrors?.taxRatePercent?.[0]}
      >
        <Input
          id="taxRatePercent"
          name="taxRatePercent"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          max="100"
          defaultValue={defaults.taxRatePercent}
          error={Boolean(state.fieldErrors?.taxRatePercent)}
          required
        />
      </FormField>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <StepBackLink href="/setup?step=1" />
        <SubmitButton size="lg">Save and continue</SubmitButton>
      </div>
    </form>
  );
}

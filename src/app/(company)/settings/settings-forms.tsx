"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import {
  updateCompanyProfileAction,
  updatePayrollConfigAction,
} from "@/features/settings/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { SUPPORTED_COUNTRIES } from "@/validations/company";

export function ProfileSettingsForm({
  defaults,
}: {
  defaults: { name: string; country: string; address: string; taxId: string };
}) {
  const [state, formAction] = useActionState(updateCompanyProfileAction, IDLE_FORM_STATE);
  useSuccessToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.message} />
      <FormField
        label="Legal company name"
        htmlFor="s-name"
        error={state.fieldErrors?.name?.[0]}
      >
        <Input id="s-name" name="name" defaultValue={defaults.name} error={Boolean(state.fieldErrors?.name)} required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Country" htmlFor="s-country" error={state.fieldErrors?.country?.[0]}>
          <Select id="s-country" name="country" defaultValue={defaults.country}>
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Payroll currency" htmlFor="s-currency">
          <Input id="s-currency" value="XAF · Central African CFA franc" disabled readOnly />
        </FormField>
      </div>
      <FormField label="Business address" htmlFor="s-address" error={state.fieldErrors?.address?.[0]}>
        <Input id="s-address" name="address" defaultValue={defaults.address} error={Boolean(state.fieldErrors?.address)} />
      </FormField>
      <FormField label="Tax ID (contribuable number)" htmlFor="s-taxId" error={state.fieldErrors?.taxId?.[0]}>
        <Input id="s-taxId" name="taxId" defaultValue={defaults.taxId} error={Boolean(state.fieldErrors?.taxId)} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function PayrollConfigForm({
  defaults,
}: {
  defaults: {
    payrollFrequency: string;
    standardHoursPerWeek: string;
    overtimeMultiplier: string;
    taxRatePercent: string;
  };
}) {
  const [state, formAction] = useActionState(updatePayrollConfigAction, IDLE_FORM_STATE);
  useSuccessToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.message} />
      <FormField label="Payroll frequency" htmlFor="s-frequency" hint="Weekly and bi-weekly runs are on the roadmap.">
        <Select id="s-frequency" name="payrollFrequency" defaultValue={defaults.payrollFrequency}>
          <option value="MONTHLY">Monthly</option>
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Standard hours per week"
          htmlFor="s-hours"
          error={state.fieldErrors?.standardHoursPerWeek?.[0]}
        >
          <Input
            id="s-hours"
            name="standardHoursPerWeek"
            type="number"
            step="0.5"
            min="1"
            max="60"
            inputMode="decimal"
            defaultValue={defaults.standardHoursPerWeek}
            error={Boolean(state.fieldErrors?.standardHoursPerWeek)}
            required
          />
        </FormField>
        <FormField
          label="Overtime multiplier"
          htmlFor="s-ot"
          error={state.fieldErrors?.overtimeMultiplier?.[0]}
        >
          <Input
            id="s-ot"
            name="overtimeMultiplier"
            type="number"
            step="0.05"
            min="1"
            max="5"
            inputMode="decimal"
            defaultValue={defaults.overtimeMultiplier}
            error={Boolean(state.fieldErrors?.overtimeMultiplier)}
            required
          />
        </FormField>
      </div>
      <FormField
        label="Flat tax rate (%)"
        htmlFor="s-tax"
        hint="Applied to gross pay. Set 0 to calculate PAYE manually per payslip."
        error={state.fieldErrors?.taxRatePercent?.[0]}
      >
        <Input
          id="s-tax"
          name="taxRatePercent"
          type="number"
          step="0.5"
          min="0"
          max="100"
          inputMode="decimal"
          defaultValue={defaults.taxRatePercent}
          error={Boolean(state.fieldErrors?.taxRatePercent)}
          required
        />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}

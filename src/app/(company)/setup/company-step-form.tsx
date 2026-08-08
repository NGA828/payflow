"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import { saveCompanyInfoStep } from "@/features/setup/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { SUPPORTED_COUNTRIES } from "@/validations/company";

export interface CompanyStepDefaults {
  name: string;
  country: string;
  address: string;
  taxId: string;
}

export function CompanyStepForm({ defaults }: { defaults: CompanyStepDefaults }) {
  const [state, formAction] = useActionState(saveCompanyInfoStep, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.message} />

      <FormField
        label="Legal company name"
        htmlFor="name"
        required
        error={state.fieldErrors?.name?.[0]}
      >
        <Input
          id="name"
          name="name"
          defaultValue={defaults.name}
          autoComplete="organization"
          placeholder="Prime Builders Ltd"
          error={Boolean(state.fieldErrors?.name)}
          required
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Country"
          htmlFor="country"
          required
          hint="PayFlow launches in Cameroon — more markets are on the way."
          error={state.fieldErrors?.country?.[0]}
        >
          <Select id="country" name="country" defaultValue={defaults.country} required>
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Payroll currency" htmlFor="currency">
          <Input id="currency" value="XAF · Central African CFA franc" disabled readOnly />
        </FormField>
      </div>

      <FormField
        label="Business address"
        htmlFor="address"
        hint="Printed on payslips."
        error={state.fieldErrors?.address?.[0]}
      >
        <Input
          id="address"
          name="address"
          defaultValue={defaults.address}
          autoComplete="street-address"
          placeholder="Bonanjo, Douala"
          error={Boolean(state.fieldErrors?.address)}
        />
      </FormField>

      <FormField
        label="Tax ID (contribuable number)"
        htmlFor="taxId"
        hint="Shown on payroll reports. You can add it later."
        error={state.fieldErrors?.taxId?.[0]}
      >
        <Input
          id="taxId"
          name="taxId"
          defaultValue={defaults.taxId}
          placeholder="M021234567890A"
          error={Boolean(state.fieldErrors?.taxId)}
        />
      </FormField>

      <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <span className="mr-auto text-xs text-muted">Takes about a minute</span>
        <SubmitButton size="lg">Save and continue</SubmitButton>
      </div>
    </form>
  );
}

/** Keeps the back-link + submit layout consistent across wizard steps. */
export function StepBackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[38px] items-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-canvas"
    >
      Back
    </Link>
  );
}

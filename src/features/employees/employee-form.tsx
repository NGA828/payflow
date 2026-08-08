"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { EMPLOYMENT_TYPES } from "@/validations/employee";

export interface PositionOption {
  id: string;
  title: string;
}

export interface DepartmentOption {
  id: string;
  name: string;
  positions: PositionOption[];
}

export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export interface EmployeeFormDefaults {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  positionId?: string;
  dateHired?: string;
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];
  basicSalary?: string;
}

type ActionFn = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Create/edit form. Pure progressive enhancement: works without JS (server
 * action + redirect), toasts and inline errors when hydrated. The position
 * picker is a single select grouped by department — the server derives the
 * department from the position, so the two can never disagree.
 */
export function EmployeeForm({
  action,
  departments,
  defaults,
  employeeId,
  submitLabel,
  cancelHref,
}: {
  action: ActionFn;
  departments: DepartmentOption[];
  defaults?: EmployeeFormDefaults;
  employeeId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  useSuccessToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}

      <section>
        <h2 className="mb-3 text-[11px] font-semibold tracking-[.08em] text-muted uppercase">
          Personal information
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <FormField label="First name" htmlFor="firstName" required error={state.fieldErrors?.firstName?.[0]}>
            <Input id="firstName" name="firstName" defaultValue={defaults?.firstName} maxLength={80} autoComplete="off" error={Boolean(state.fieldErrors?.firstName)} />
          </FormField>
          <FormField label="Last name" htmlFor="lastName" required error={state.fieldErrors?.lastName?.[0]}>
            <Input id="lastName" name="lastName" defaultValue={defaults?.lastName} maxLength={80} autoComplete="off" error={Boolean(state.fieldErrors?.lastName)} />
          </FormField>
          <FormField label="Date of birth" htmlFor="dateOfBirth" error={state.fieldErrors?.dateOfBirth?.[0]}>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={defaults?.dateOfBirth} error={Boolean(state.fieldErrors?.dateOfBirth)} />
          </FormField>
          <FormField label="National ID" htmlFor="nationalId" error={state.fieldErrors?.nationalId?.[0]}>
            <Input id="nationalId" name="nationalId" defaultValue={defaults?.nationalId} maxLength={40} autoComplete="off" placeholder="Optional" error={Boolean(state.fieldErrors?.nationalId)} />
          </FormField>
          <FormField label="Phone" htmlFor="phone" error={state.fieldErrors?.phone?.[0]}>
            <Input id="phone" name="phone" defaultValue={defaults?.phone} maxLength={24} autoComplete="off" placeholder="+237 6XX XX XX XX" error={Boolean(state.fieldErrors?.phone)} />
          </FormField>
          <FormField label="Work email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
            <Input id="email" name="email" type="email" defaultValue={defaults?.email} autoComplete="off" placeholder="Optional" error={Boolean(state.fieldErrors?.email)} />
          </FormField>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold tracking-[.08em] text-muted uppercase">
          Role &amp; employment
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <FormField label="Position" htmlFor="positionId" required error={state.fieldErrors?.positionId?.[0]} hint="The department is set by the position.">
            <Select id="positionId" name="positionId" defaultValue={defaults?.positionId ?? ""} error={Boolean(state.fieldErrors?.positionId)}>
              <option value="" disabled>
                Choose a position…
              </option>
              {departments.map((department) => (
                <optgroup key={department.id} label={department.name}>
                  {department.positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </FormField>
          <FormField label="Employment type" htmlFor="employmentType" required error={state.fieldErrors?.employmentType?.[0]}>
            <Select id="employmentType" name="employmentType" defaultValue={defaults?.employmentType ?? "FULL_TIME"} error={Boolean(state.fieldErrors?.employmentType)}>
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Hire date" htmlFor="dateHired" required error={state.fieldErrors?.dateHired?.[0]}>
            <Input id="dateHired" name="dateHired" type="date" defaultValue={defaults?.dateHired} error={Boolean(state.fieldErrors?.dateHired)} />
          </FormField>
          <FormField label="Monthly basic salary (XAF)" htmlFor="basicSalary" required error={state.fieldErrors?.basicSalary?.[0]} hint="Whole XAF, no decimals.">
            <Input id="basicSalary" name="basicSalary" inputMode="numeric" defaultValue={defaults?.basicSalary} placeholder="450000" autoComplete="off" error={Boolean(state.fieldErrors?.basicSalary)} />
          </FormField>
        </div>
      </section>

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

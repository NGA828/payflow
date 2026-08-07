"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerAction, type AuthFormState } from "@/features/auth/actions";

export function RegisterForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(registerAction, {
    status: "idle",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
          {state.message}
        </p>
      )}
      <FormField label="Full name" htmlFor="fullName" error={state.fieldErrors?.fullName?.[0]}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder="John Dione"
          error={Boolean(state.fieldErrors?.fullName)}
          required
        />
      </FormField>
      <FormField label="Work email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={Boolean(state.fieldErrors?.email)}
          required
        />
      </FormField>
      <FormField
        label="Company name"
        htmlFor="companyName"
        hint="Shown on payslips and reports."
        error={state.fieldErrors?.companyName?.[0]}
      >
        <Input
          id="companyName"
          name="companyName"
          autoComplete="organization"
          placeholder="Prime Builders Ltd"
          error={Boolean(state.fieldErrors?.companyName)}
          required
        />
      </FormField>
      <FormField
        label="Password"
        htmlFor="password"
        hint="Min. 10 characters with a mix of letters, numbers and symbols."
        error={state.fieldErrors?.password?.[0]}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          error={Boolean(state.fieldErrors?.password)}
          required
        />
      </FormField>
      <SubmitButton className="w-full" size="lg">
        Create workspace
      </SubmitButton>
      <p className="text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}

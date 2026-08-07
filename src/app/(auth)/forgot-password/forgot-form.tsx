"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestResetAction, type AuthFormState } from "@/features/auth/actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(requestResetAction, {
    status: "idle",
  });

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="rounded-lg bg-success-tint px-3 py-2.5 text-[13px] text-success">
          {state.message}
        </p>
        <Link href="/login" className="text-[12.5px] font-semibold text-primary-600 hover:text-primary-700">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
          {state.message}
        </p>
      )}
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
      <SubmitButton className="w-full" size="lg">
        Send reset link
      </SubmitButton>
      <p className="text-center text-[12.5px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}

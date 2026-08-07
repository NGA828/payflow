"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendVerificationAction, type AuthFormState } from "@/features/auth/actions";

export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(resendVerificationAction, {
    status: "idle",
  });

  if (state.status === "success") {
    return (
      <p className="rounded-lg bg-success-tint px-3 py-2.5 text-center text-[13px] text-success">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.message && state.status === "error" && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
          {state.message}
        </p>
      )}
      <FormField label="Work email" htmlFor="resend-email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="resend-email"
          name="email"
          type="email"
          defaultValue={defaultEmail}
          placeholder="you@company.com"
          error={Boolean(state.fieldErrors?.email)}
          required
        />
      </FormField>
      <SubmitButton variant="secondary" className="w-full">
        Resend verification link
      </SubmitButton>
    </form>
  );
}

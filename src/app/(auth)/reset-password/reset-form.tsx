"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { resetPasswordAction, type AuthFormState } from "@/features/auth/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(resetPasswordAction, {
    status: "idle",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
          {state.message}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <FormField
        label="New password"
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
        Update password
      </SubmitButton>
    </form>
  );
}

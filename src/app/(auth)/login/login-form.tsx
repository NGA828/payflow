"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction, type AuthFormState } from "@/features/auth/actions";

export function LoginForm({ next }: { next?: string | undefined }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(loginAction, {
    status: "idle",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
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
      <FormField label="Password" htmlFor="password" error={state.fieldErrors?.password?.[0]}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          error={Boolean(state.fieldErrors?.password)}
          required
        />
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[12.5px] font-medium text-primary-600 hover:text-primary-700">
          Forgot password?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg">
        Sign in
      </SubmitButton>
      <p className="text-center text-[12.5px] text-muted">
        New to PayFlow?{" "}
        <Link href="/register" className="font-semibold text-primary-600 hover:text-primary-700">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}

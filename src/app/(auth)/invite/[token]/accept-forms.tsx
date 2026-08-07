"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import {
  acceptInviteExistingUserAction,
  acceptInviteNewUserAction,
} from "@/features/team/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";

/** New account: full name + password, then straight to sign-in. */
export function AcceptInviteNewUserForm({ token, email }: { token: string; email: string }) {
  const [state, formAction] = useActionState(acceptInviteNewUserAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.message} />
      <FormField label="Work email" htmlFor="email-readonly">
        <Input id="email-readonly" value={email} disabled readOnly />
      </FormField>
      <FormField
        label="Full name"
        htmlFor="fullName"
        error={state.fieldErrors?.fullName?.[0]}
      >
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder="Amina Bello"
          error={Boolean(state.fieldErrors?.fullName)}
          required
        />
      </FormField>
      <FormField
        label="Create a password"
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
      <SubmitButton size="lg" className="w-full">
        Accept and create account
      </SubmitButton>
    </form>
  );
}

/** Existing account already signed in with the invited email: one click. */
export function AcceptInviteExistingUserForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptInviteExistingUserAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.message} />
      <SubmitButton size="lg" className="w-full">
        Accept invitation
      </SubmitButton>
    </form>
  );
}

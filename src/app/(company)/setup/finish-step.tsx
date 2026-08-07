"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import { finishSetupAction } from "@/features/setup/actions";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { StepBackLink } from "./company-step-form";

export function FinishButton() {
  const [state, formAction] = useActionState(finishSetupAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={state.message} />
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <StepBackLink href="/setup?step=4" />
        <SubmitButton size="lg">
          <CheckCircle2 className="h-4 w-4" />
          Finish setup
        </SubmitButton>
      </div>
    </form>
  );
}

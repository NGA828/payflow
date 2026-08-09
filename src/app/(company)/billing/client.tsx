"use client";

import { useActionState } from "react";
import { CreditCard, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { activatePlanAction } from "@/features/billing/actions";

export function BillingActions({ planCode, current }: { planCode: string; current: boolean }) {
  const [state, formAction] = useActionState(activatePlanAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  const hasError = state.status === "error" && Boolean(state.message);

  if (current) {
    return (
      <div className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-50 px-3 text-[12.5px] font-semibold text-teal-700">
        <Check className="h-4 w-4" /> Current plan
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="planCode" value={planCode} />
      <Button variant="primary" size="sm" type="submit">
        <CreditCard className="h-4 w-4" /> Activate {planCode}
      </Button>
      {hasError && <p className="text-[11px] text-danger">{state.message}</p>}
    </form>
  );
}

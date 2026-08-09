"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { togglePlanAction, upsertPlanAction } from "@/features/super-admin/actions";

export function PlanActions({ plan }: { plan: { id: string; isActive: boolean } }) {
  const [state, formAction] = useActionState(togglePlanAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="planId" value={plan.id} />
      <Button variant="secondary" size="sm" type="submit">
        {plan.isActive ? "Deactivate" : "Activate"}
      </Button>
      {state.status === "error" && <span className="text-[11px] text-danger">{state.message}</span>}
    </form>
  );
}

export function CreatePlanForm() {
  const [state, formAction] = useActionState(upsertPlanAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-5">
      <input name="code" placeholder="code (e.g. starter)" className="h-9 rounded-lg border border-border px-3 text-[13px]" required />
      <input name="name" placeholder="Name" className="h-9 rounded-lg border border-border px-3 text-[13px]" required />
      <input name="maxEmployees" type="number" placeholder="Max employees" className="h-9 rounded-lg border border-border px-3 text-[13px]" required />
      <input name="priceMonthly" type="number" placeholder="Price XAF" className="h-9 rounded-lg border border-border px-3 text-[13px]" required />
      <input name="trialDays" type="number" placeholder="Trial days" defaultValue={14} className="h-9 rounded-lg border border-border px-3 text-[13px]" required />
      <div className="md:col-span-5 flex items-center gap-2">
        <button type="submit" className="h-9 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white">Save plan</button>
        {state.status === "error" && <span className="text-[11px] text-danger">{state.message}</span>}
      </div>
    </form>
  );
}


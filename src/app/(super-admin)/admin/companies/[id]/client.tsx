"use client";

import { useActionState } from "react";
import { ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { suspendCompanyAction, reactivateCompanyAction } from "@/features/super-admin/actions";

type ActionFn = (prev: FormState, formData: FormData) => Promise<FormState>;

function ActionButton({ action, companyId, label, variant, icon: Icon }: { action: ActionFn; companyId: string; label: string; variant: "destructive" | "secondary"; icon: LucideIcon }) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  useSuccessToast(state);
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="companyId" value={companyId} />
      <Button variant={variant} size="sm" type="submit"><Icon className="h-4 w-4" /> {label}</Button>
      {state.status === "error" && <span className="text-[11px] text-danger">{state.message}</span>}
    </form>
  );
}

export function SuspendActions({ companyId, status }: { companyId: string; status: string }) {
  if (status === "SUSPENDED") {
    return <ActionButton action={reactivateCompanyAction} companyId={companyId} label="Reactivate" variant="secondary" icon={ShieldCheck} />;
  }
  return <ActionButton action={suspendCompanyAction} companyId={companyId} label="Suspend" variant="destructive" icon={ShieldAlert} />;
}

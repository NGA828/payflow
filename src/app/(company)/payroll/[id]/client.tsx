"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { deletePeriodAction, processPayrollAction } from "@/features/payroll/actions";

/**
 * Destructive delete for DRAFT periods. On success the period no longer
 * exists, so we navigate back to the list rather than staying on the page.
 */
export function DeletePeriodButton({
  periodId,
  periodName,
}: {
  periodId: string;
  periodName: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deletePeriodAction, IDLE_FORM_STATE);

  const succeeded = state.status === "success";
  useEffect(() => {
    if (!succeeded || !state.message) return;
    toast.success(state.message);
    router.push("/payroll");
  }, [succeeded, state, router]);

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete draft
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete “${periodName}”?`}>
        <div className="flex gap-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-tint text-danger">
            <Trash2 className="h-4 w-4" />
          </span>
          <p className="text-[13px] leading-relaxed text-body">
            This draft period and any adjustment notes on it will be removed permanently.
            Payslips have not been computed yet, so nothing financial is lost.
          </p>
        </div>
        <form action={formAction} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="periodId" value={periodId} />
          <FormError message={state.message} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive">Delete period</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * Process / re-process button. Inline runs finish inside the request, so the
 * pending state is brief and the toast carries the totals summary.
 */
export function ProcessPayrollButton({
  periodId,
  reprocess,
}: {
  periodId: string;
  reprocess: boolean;
}) {
  const [state, formAction] = useActionState(processPayrollAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  const hasError = state.status === "error" && Boolean(state.message);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="payrollPeriodId" value={periodId} />
      <SubmitButton variant={reprocess ? "secondary" : "primary"} size="sm">
        <Play className="h-3.5 w-3.5" />
        {reprocess ? "Re-process" : "Process payroll"}
      </SubmitButton>
      {hasError && <p className="text-[12px] text-danger">{state.message}</p>}
    </form>
  );
}

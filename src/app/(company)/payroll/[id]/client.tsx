"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { deletePeriodAction } from "@/features/payroll/actions";

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

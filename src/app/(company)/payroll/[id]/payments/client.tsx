"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Lock, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { lockPeriodAction, markPaymentStatusAction } from "@/features/payroll/actions";

/** Per-row payment recording. Two mini forms: mark paid (optional bank/momo
 * reference) and mark failed (reason required, retryable). Successful rows
 * are final by design. */
export function PaymentRowActions({
  periodId,
  paymentId,
}: {
  periodId: string;
  paymentId: string;
}) {
  const [paidState, paidAction] = useActionState(markPaymentStatusAction, IDLE_FORM_STATE);
  const [failedState, failedAction] = useActionState(markPaymentStatusAction, IDLE_FORM_STATE);
  const paidSucceeded = useSuccessToast(paidState);
  const failedSucceeded = useSuccessToast(failedState);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (paidSucceeded) setReference("");
  }, [paidSucceeded]);
  useEffect(() => {
    if (failedSucceeded) setReason("");
  }, [failedSucceeded]);

  const paidError =
    paidState.status === "error"
      ? (paidState.fieldErrors?.reference?.[0] ?? paidState.message)
      : undefined;
  const failedError =
    failedState.status === "error"
      ? (failedState.fieldErrors?.failureReason?.[0] ?? failedState.message)
      : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <form action={paidAction} className="flex items-center gap-1.5">
        <input type="hidden" name="payrollPeriodId" value={periodId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="outcome" value="SUCCESSFUL" />
        <Input
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Bank/momo ref (optional)"
          aria-label="Payment reference"
          error={Boolean(paidState.fieldErrors?.reference)}
          className="h-7 w-[150px] text-[11.5px]"
        />
        <SubmitButton variant="teal" size="sm">
          <Check className="h-3 w-3" /> Paid
        </SubmitButton>
      </form>
      {paidError && <p className="text-[11px] text-danger">{paidError}</p>}
      <form action={failedAction} className="flex items-center gap-1.5">
        <input type="hidden" name="payrollPeriodId" value={periodId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="outcome" value="FAILED" />
        <Input
          name="failureReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why did it fail?"
          aria-label="Failure reason"
          error={Boolean(failedState.fieldErrors?.failureReason)}
          className="h-7 w-[150px] text-[11.5px]"
        />
        <SubmitButton variant="secondary" size="sm">
          <XCircle className="h-3 w-3 text-danger" /> Fail
        </SubmitButton>
      </form>
      {failedError && <p className="text-[11px] text-danger">{failedError}</p>}
    </div>
  );
}

/** PAID → LOCKED. Final by definition — the banner spells it out. */
export function LockPeriodButton({ periodId }: { periodId: string }) {
  const [state, formAction] = useActionState(lockPeriodAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  const hasError = state.status === "error" && Boolean(state.message);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="payrollPeriodId" value={periodId} />
      <SubmitButton variant="secondary" size="sm">
        <Lock className="h-3.5 w-3.5" /> Lock period
      </SubmitButton>
      {hasError && <p className="text-[12px] text-danger">{state.message}</p>}
    </form>
  );
}

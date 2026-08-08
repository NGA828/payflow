"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { BadgeCheck, Ban, CircleOff, Eye, Pencil, UserRoundX } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowMenu } from "@/components/ui/row-menu";
import { FormField } from "@/components/ui/form-field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import {
  setEmployeeStatusAction,
  terminateEmployeeAction,
  updatePaymentDetailsAction,
} from "@/features/employees/actions";
import { MOBILE_MONEY_PROVIDERS, PAYMENT_METHODS } from "@/validations/employee";

// ── Terminate (custom dialog: needs the date input) ─────────────────

export function TerminateDialog({
  open,
  onClose,
  employeeId,
  employeeName,
  today,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  today: string;
}) {
  const [state, formAction] = useActionState(terminateEmployeeAction, IDLE_FORM_STATE);
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) onClose();
  }, [succeeded, onClose]);

  return (
    <Dialog open={open} onClose={onClose} title={`End employment — ${employeeName}`}>
      <div className="flex gap-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-tint text-danger">
          <UserRoundX className="h-4 w-4" />
        </span>
        <p className="text-[13px] leading-relaxed text-body">
          {employeeName} will be marked terminated and excluded from future payroll runs after
          their final period. The record is kept for history and cannot be reactivated.
        </p>
      </div>
      <form action={formAction} className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="employeeId" value={employeeId} />
        <FormField
          label="Last working day"
          htmlFor="terminationDate"
          required
          error={state.fieldErrors?.terminationDate?.[0]}
        >
          <Input
            id="terminationDate"
            name="terminationDate"
            type="date"
            defaultValue={today}
            max={today}
            error={Boolean(state.fieldErrors?.terminationDate)}
          />
        </FormField>
        <FormError message={state.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton variant="destructive">Terminate employment</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

// ── Status + edit actions (directory rows & profile header) ─────────

interface StatusTarget {
  id: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE" | "TERMINATED";
}

export function useEmployeeActions(employee: StatusTarget) {
  const [confirm, setConfirm] = useState<"status" | "terminate" | null>(null);
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const deactivated = employee.status === "INACTIVE";

  const menu =
    employee.status === "TERMINATED"
      ? [
          { label: "View profile", icon: Eye, onSelect: () => router.push(`/employees/${employee.id}`) },
        ]
      : [
          { label: "View profile", icon: Eye, onSelect: () => router.push(`/employees/${employee.id}`) },
          { label: "Edit record", icon: Pencil, onSelect: () => router.push(`/employees/${employee.id}/edit`) },
          {
            label: deactivated ? "Reactivate" : "Deactivate",
            icon: deactivated ? BadgeCheck : CircleOff,
            onSelect: () => setConfirm("status"),
          },
          {
            label: "Terminate…",
            icon: UserRoundX,
            destructive: true,
            onSelect: () => setConfirm("terminate"),
          },
        ];

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirm === "status"}
        onClose={() => setConfirm(null)}
        icon={deactivated ? BadgeCheck : Ban}
        iconTint={deactivated ? "bg-success-tint text-success" : "bg-warning-tint text-warning"}
        title={`${deactivated ? "Reactivate" : "Deactivate"} ${employee.fullName}?`}
        body={
          deactivated
            ? `${employee.fullName} will appear in the directory again, but stays excluded from payroll until their records say otherwise.`
            : `${employee.fullName} keeps their record but is hidden from active lists and excluded from payroll runs. You can reactivate anytime.`
        }
        confirmLabel={deactivated ? "Reactivate" : "Deactivate"}
        action={setEmployeeStatusAction}
        fields={{ employeeId: employee.id, status: deactivated ? "ACTIVE" : "INACTIVE" }}
      />
      <TerminateDialog
        open={confirm === "terminate"}
        onClose={() => setConfirm(null)}
        employeeId={employee.id}
        employeeName={employee.fullName}
        today={today}
      />
    </>
  );

  return { menu, dialogs };
}

export function DirectoryRowActions({ employee }: { employee: StatusTarget }) {
  const { menu, dialogs } = useEmployeeActions(employee);
  return (
    <>
      <RowMenu items={menu} label={`Actions for ${employee.fullName}`} />
      {dialogs}
    </>
  );
}

export function ProfileStatusActions({ employee }: { employee: StatusTarget }) {
  const { menu, dialogs } = useEmployeeActions(employee);
  const router = useRouter();
  const items = menu.filter((item) => item.label !== "View profile");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {employee.status !== "TERMINATED" && (
        <Button variant="secondary" size="sm" onClick={() => router.push(`/employees/${employee.id}/edit`)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      )}
      {items
        .filter((item) => item.label !== "Edit record")
        .map((item) => (
          <Button
            key={item.label}
            variant={item.destructive ? "destructive" : "secondary"}
            size="sm"
            onClick={item.onSelect}
          >
            {item.icon && <item.icon className="h-3.5 w-3.5" />}
            {item.label.replace("…", "")}
          </Button>
        ))}
      {dialogs}
    </div>
  );
}

// ── Payment details form (payment tab) ──────────────────────────────

/**
 * Empty fields keep the stored value — secrets round-trip encrypted and are
 * never rendered back into inputs.
 */
export function PaymentDetailsForm({
  employeeId,
  defaultMethod,
  defaultProvider,
}: {
  employeeId: string;
  defaultMethod: (typeof PAYMENT_METHODS)[number];
  defaultProvider?: string | null;
}) {
  const [state, formAction] = useActionState(updatePaymentDetailsAction, IDLE_FORM_STATE);
  useSuccessToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormField label="Payment method" htmlFor="paymentMethod" required error={state.fieldErrors?.paymentMethod?.[0]}>
        <Select id="paymentMethod" name="paymentMethod" defaultValue={defaultMethod} error={Boolean(state.fieldErrors?.paymentMethod)}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method === "BANK" ? "Bank transfer" : method === "MOBILE_MONEY" ? "Mobile money" : "Cash"}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="grid gap-3.5 rounded-lg border border-border bg-canvas/60 p-4 sm:grid-cols-2">
        <FormField label="Bank name" htmlFor="bankName" error={state.fieldErrors?.bankName?.[0]}>
          <Input id="bankName" name="bankName" maxLength={120} autoComplete="off" placeholder="Leave blank to keep current" error={Boolean(state.fieldErrors?.bankName)} />
        </FormField>
        <FormField label="Account number" htmlFor="bankAccountNumber" error={state.fieldErrors?.bankAccountNumber?.[0]}>
          <Input id="bankAccountNumber" name="bankAccountNumber" maxLength={40} autoComplete="off" placeholder="Leave blank to keep current" error={Boolean(state.fieldErrors?.bankAccountNumber)} />
        </FormField>
      </div>

      <div className="grid gap-3.5 rounded-lg border border-border bg-canvas/60 p-4 sm:grid-cols-2">
        <FormField label="Mobile money provider" htmlFor="mobileMoneyProvider" error={state.fieldErrors?.mobileMoneyProvider?.[0]}>
          <Select id="mobileMoneyProvider" name="mobileMoneyProvider" defaultValue={defaultProvider ?? ""} error={Boolean(state.fieldErrors?.mobileMoneyProvider)}>
            <option value="">Choose…</option>
            {MOBILE_MONEY_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {provider === "MTN" ? "MTN Mobile Money" : "Orange Money"}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Wallet number" htmlFor="mobileMoneyNumber" error={state.fieldErrors?.mobileMoneyNumber?.[0]}>
          <Input id="mobileMoneyNumber" name="mobileMoneyNumber" maxLength={20} autoComplete="off" placeholder="Leave blank to keep current" error={Boolean(state.fieldErrors?.mobileMoneyNumber)} />
        </FormField>
      </div>

      <FormError message={state.message} />
      <div className="flex justify-end">
        <SubmitButton>Save payment details</SubmitButton>
      </div>
    </form>
  );
}

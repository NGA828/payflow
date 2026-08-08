"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { AdjustmentType } from "@prisma/client";
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
  createAdjustmentAction,
  deleteAdjustmentAction,
  updateAdjustmentAction,
} from "@/features/payroll/actions";
import {
  ADJUSTMENT_TYPE_LABELS,
  DEDUCTION_TYPES,
  EARNING_TYPES,
} from "@/validations/adjustment";

export interface EmployeeOption {
  id: string;
  label: string; // "Ngo Bell, Amina · PB-0001"
}

export interface EditableAdjustment {
  id: string;
  employeeId: string;
  type: AdjustmentType;
  amount: string;
  hours: string | null;
  note: string | null;
}

function AdjustmentDialog({
  open,
  onClose,
  mode,
  payrollPeriodId,
  employees,
  category,
  adjustment,
}: {
  open: boolean;
  onClose: () => void;
  mode: "add" | "edit";
  payrollPeriodId: string;
  employees: EmployeeOption[];
  category: "EARNING" | "DEDUCTION";
  adjustment?: EditableAdjustment;
}) {
  const action = mode === "add" ? createAdjustmentAction : updateAdjustmentAction;
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) onClose();
  }, [succeeded, onClose]);

  const types: readonly AdjustmentType[] = category === "EARNING" ? EARNING_TYPES : DEDUCTION_TYPES;
  const defaultType =
    adjustment && (types as readonly string[]).includes(adjustment.type)
      ? adjustment.type
      : (types[0] as AdjustmentType);
  const [selectedType, setSelectedType] = useState<string>(defaultType);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${mode === "add" ? "Add" : "Edit"} ${category === "EARNING" ? "earning" : "deduction"}`}
    >
      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="payrollPeriodId" value={payrollPeriodId} />
        {adjustment && <input type="hidden" name="adjustmentId" value={adjustment.id} />}

        <FormField label="Employee" htmlFor="employeeId" required error={state.fieldErrors?.employeeId?.[0]}>
          <Select id="employeeId" name="employeeId" defaultValue={adjustment?.employeeId ?? ""} error={Boolean(state.fieldErrors?.employeeId)}>
            <option value="" disabled>
              Choose an employee…
            </option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <FormField label="Type" htmlFor="type" required error={state.fieldErrors?.type?.[0]}>
            <Select
              id="type"
              name="type"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              error={Boolean(state.fieldErrors?.type)}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {ADJUSTMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </FormField>
          {selectedType === "OVERTIME" ? (
            <FormField label="Hours worked" htmlFor="hours" required error={state.fieldErrors?.hours?.[0]} hint="Pay = hours × rate × overtime multiplier, computed automatically.">
              <Input id="hours" name="hours" inputMode="decimal" defaultValue={adjustment?.hours ?? undefined} placeholder="6.5" autoComplete="off" error={Boolean(state.fieldErrors?.hours)} />
            </FormField>
          ) : (
            <FormField label="Amount (XAF)" htmlFor="amount" required error={state.fieldErrors?.amount?.[0]} hint="Whole XAF.">
              <Input id="amount" name="amount" inputMode="numeric" defaultValue={adjustment?.amount} placeholder="25000" autoComplete="off" error={Boolean(state.fieldErrors?.amount)} />
            </FormField>
          )}
        </div>

        <FormField label="Note" htmlFor="note" error={state.fieldErrors?.note?.[0]}>
          <Input id="note" name="note" defaultValue={adjustment?.note ?? undefined} maxLength={200} autoComplete="off" placeholder="Optional context" error={Boolean(state.fieldErrors?.note)} />
        </FormField>

        <FormError message={state.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton>{mode === "add" ? "Add adjustment" : "Save changes"}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

export function AddAdjustmentButton({
  payrollPeriodId,
  employees,
  category,
}: {
  payrollPeriodId: string;
  employees: EmployeeOption[];
  category: "EARNING" | "DEDUCTION";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add {category === "EARNING" ? "earning" : "deduction"}
      </Button>
      {open && (
        <AdjustmentDialog
          open={open}
          onClose={() => setOpen(false)}
          mode="add"
          payrollPeriodId={payrollPeriodId}
          employees={employees}
          category={category}
        />
      )}
    </>
  );
}

export function AdjustmentRowActions({
  payrollPeriodId,
  employees,
  adjustment,
}: {
  payrollPeriodId: string;
  employees: EmployeeOption[];
  adjustment: EditableAdjustment & { category: "EARNING" | "DEDUCTION"; label: string };
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <RowMenu
        label="Adjustment actions"
        items={[
          { label: "Edit…", icon: Pencil, onSelect: () => setDialog("edit") },
          { label: "Delete…", icon: Trash2, destructive: true, onSelect: () => setDialog("delete") },
        ]}
      />
      {dialog === "edit" && (
        <AdjustmentDialog
          open
          onClose={() => setDialog(null)}
          mode="edit"
          payrollPeriodId={payrollPeriodId}
          employees={employees}
          category={adjustment.category}
          adjustment={adjustment}
        />
      )}
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        icon={Trash2}
        iconTint="bg-danger-tint text-danger"
        title={`Delete ${adjustment.label}?`}
        body="The amount is removed from this period immediately and totals are recalculated. This cannot be undone."
        confirmLabel="Delete adjustment"
        destructive
        action={deleteAdjustmentAction}
        fields={{ payrollPeriodId, adjustmentId: adjustment.id }}
      />
    </>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { RowMenu } from "@/components/ui/row-menu";
import { FormField } from "@/components/ui/form-field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import {
  createDepartmentAction,
  createPositionAction,
  removeDepartmentAction,
  removePositionAction,
  restoreDepartmentAction,
  restorePositionAction,
  updateDepartmentAction,
  updatePositionAction,
} from "@/features/org/actions";

// ── Shared confirmation dialog ──────────────────────────────────────

type ActionFn = (prev: FormState, formData: FormData) => Promise<FormState>;

function ConfirmDialog({
  open,
  onClose,
  icon: Icon,
  iconTint,
  title,
  body,
  confirmLabel,
  destructive = false,
  action,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  iconTint: string;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  action: ActionFn;
  fields: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) onClose();
  }, [succeeded, onClose]);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex gap-3.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconTint}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[13px] leading-relaxed text-body">{body}</p>
      </div>
      <form action={formAction} className="mt-5 flex flex-col gap-3">
        {Object.entries(fields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <FormError message={state.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton variant={destructive ? "destructive" : "primary"}>
            {confirmLabel}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

// ── Department form (create / edit) ─────────────────────────────────

export function DepartmentFormDialog({
  open,
  onClose,
  department,
}: {
  open: boolean;
  onClose: () => void;
  department?: { id: string; name: string; description: string | null };
}) {
  const isEdit = Boolean(department);
  const [state, formAction] = useActionState(
    isEdit ? updateDepartmentAction : createDepartmentAction,
    IDLE_FORM_STATE,
  );
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) onClose();
  }, [succeeded, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${department?.name}` : "New department"}
      description={isEdit ? "Rename or redescribe this department." : "A department groups positions and employees — e.g. Operations."}
    >
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {isEdit && <input type="hidden" name="departmentId" value={department?.id} />}
        <FormError message={state.message} />
        <FormField label="Name" htmlFor="dept-name" required error={state.fieldErrors?.name?.[0]}>
          <Input
            id="dept-name"
            name="name"
            defaultValue={department?.name ?? ""}
            placeholder="Operations"
            error={Boolean(state.fieldErrors?.name)}
            required
          />
        </FormField>
        <FormField
          label="Description"
          htmlFor="dept-description"
          hint="Optional — shown on the department page."
          error={state.fieldErrors?.description?.[0]}
        >
          <Input
            id="dept-description"
            name="description"
            defaultValue={department?.description ?? ""}
            placeholder="Field crews and site management"
            error={Boolean(state.fieldErrors?.description)}
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton>{isEdit ? "Save changes" : "Create department"}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

// ── Position form (create / edit) ───────────────────────────────────

export function PositionFormDialog({
  open,
  onClose,
  departmentId,
  position,
}: {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  position?: { id: string; title: string };
}) {
  const isEdit = Boolean(position);
  const [state, formAction] = useActionState(
    isEdit ? updatePositionAction : createPositionAction,
    IDLE_FORM_STATE,
  );
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) onClose();
  }, [succeeded, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${position?.title}` : "New position"}
      description="A job title inside this department — e.g. Site Engineer."
    >
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="departmentId" value={departmentId} />
        {isEdit && <input type="hidden" name="positionId" value={position?.id} />}
        <FormError message={state.message} />
        <FormField label="Title" htmlFor="pos-title" required error={state.fieldErrors?.title?.[0]}>
          <Input
            id="pos-title"
            name="title"
            defaultValue={position?.title ?? ""}
            placeholder="Site Engineer"
            error={Boolean(state.fieldErrors?.title)}
            required
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton>{isEdit ? "Save changes" : "Create position"}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

// ── Trigger buttons ─────────────────────────────────────────────────

export function NewDepartmentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New department
      </Button>
      <DepartmentFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function NewPositionButton({ departmentId }: { departmentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New position
      </Button>
      <PositionFormDialog open={open} onClose={() => setOpen(false)} departmentId={departmentId} />
    </>
  );
}

// ── Row action bundles ──────────────────────────────────────────────

export interface DepartmentActionProps {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  totalEmployees: number;
  /** When used on the department detail page. */
  fromDetail?: boolean;
}

export function DepartmentRowActions({
  department,
  fromDetail = false,
}: {
  department: DepartmentActionProps;
  fromDetail?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const archived = department.status === "ARCHIVED";
  const deletable = department.totalEmployees === 0;

  return (
    <>
      <RowMenu
        label={`Actions for ${department.name}`}
        items={
          archived
            ? [
                {
                  label: "Restore department",
                  icon: ArchiveRestore,
                  onSelect: () => setRestoring(true),
                },
              ]
            : [
                { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
                {
                  label: deletable ? "Delete department" : "Archive department",
                  icon: deletable ? Trash2 : Archive,
                  destructive: deletable,
                  onSelect: () => setConfirming(true),
                },
              ]
        }
      />

      <DepartmentFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        department={{
          id: department.id,
          name: department.name,
          description: department.description,
        }}
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        icon={deletable ? Trash2 : Archive}
        iconTint={deletable ? "bg-danger-tint text-danger" : "bg-warning-tint text-warning"}
        title={deletable ? `Delete ${department.name}?` : `Archive ${department.name}?`}
        body={
          deletable
            ? "This permanently removes the department and all of its positions. This action cannot be undone."
            : `${department.totalEmployees} employee${department.totalEmployees === 1 ? "" : "s"} reference this department, so it can't be deleted. Archiving keeps everyone's history intact, but hides it from new assignments. You can restore it anytime.`
        }
        confirmLabel={deletable ? "Delete permanently" : "Archive department"}
        destructive={deletable}
        action={removeDepartmentAction}
        fields={{ departmentId: department.id, ...(fromDetail ? { fromDetail: "1" } : {}) }}
      />

      <ConfirmDialog
        open={restoring}
        onClose={() => setRestoring(false)}
        icon={ArchiveRestore}
        iconTint="bg-success-tint text-success"
        title={`Restore ${department.name}?`}
        body="The department becomes available again for positions and employee assignments."
        confirmLabel="Restore department"
        action={restoreDepartmentAction}
        fields={{ departmentId: department.id }}
      />
    </>
  );
}

export interface PositionActionProps {
  id: string;
  departmentId: string;
  title: string;
  status: "ACTIVE" | "ARCHIVED";
  totalEmployees: number;
}

export function PositionRowActions({ position }: { position: PositionActionProps }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const archived = position.status === "ARCHIVED";
  const deletable = position.totalEmployees === 0;

  return (
    <>
      <RowMenu
        label={`Actions for ${position.title}`}
        items={
          archived
            ? [
                {
                  label: "Restore position",
                  icon: ArchiveRestore,
                  onSelect: () => setRestoring(true),
                },
              ]
            : [
                { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
                {
                  label: deletable ? "Delete position" : "Archive position",
                  icon: deletable ? Trash2 : Archive,
                  destructive: deletable,
                  onSelect: () => setConfirming(true),
                },
              ]
        }
      />

      <PositionFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        departmentId={position.departmentId}
        position={{ id: position.id, title: position.title }}
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        icon={deletable ? Trash2 : Archive}
        iconTint={deletable ? "bg-danger-tint text-danger" : "bg-warning-tint text-warning"}
        title={deletable ? `Delete ${position.title}?` : `Archive ${position.title}?`}
        body={
          deletable
            ? "This permanently removes the position. This action cannot be undone."
            : `${position.totalEmployees} employee${position.totalEmployees === 1 ? "" : "s"} reference this position, so it can't be deleted. Archiving keeps everyone's history intact, but hides it from new assignments.`
        }
        confirmLabel={deletable ? "Delete permanently" : "Archive position"}
        destructive={deletable}
        action={removePositionAction}
        fields={{ positionId: position.id, departmentId: position.departmentId }}
      />

      <ConfirmDialog
        open={restoring}
        onClose={() => setRestoring(false)}
        icon={ArchiveRestore}
        iconTint="bg-success-tint text-success"
        title={`Restore ${position.title}?`}
        body="The position becomes available again for employee assignments."
        confirmLabel="Restore position"
        action={restorePositionAction}
        fields={{ positionId: position.id, departmentId: position.departmentId }}
      />
    </>
  );
}

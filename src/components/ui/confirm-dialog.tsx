"use client";

import { useActionState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";

type ActionFn = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Standard confirm-then-act dialog: icon + copy + Cancel/Confirm, wired to a
 * server action with hidden fields. Closes and toasts on success.
 */
export function ConfirmDialog({
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

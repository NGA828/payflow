"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";

type ActionFn = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Single-click server-action runner (no dialog): builds FormData from fields,
 * runs in a transition, toasts the outcome. For low-risk actions (resend etc.).
 */
export function useDirectAction(action: ActionFn, fields: Record<string, string>) {
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      const result = await action(IDLE_FORM_STATE, formData);
      if (result.status === "success" && result.message) toast.success(result.message);
      if (result.status === "error") {
        toast.error(result.message ?? "Something went wrong. Please try again.");
      }
    });

  return { pending, run };
}

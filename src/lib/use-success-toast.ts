"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/form-state";

/**
 * Toasts a server action's success message once, when the state changes.
 * Returns true when the action just succeeded (so callers can close dialogs).
 */
export function useSuccessToast(state: FormState): boolean {
  const last = useRef<FormState>(state);
  const justSucceeded = state.status === "success" && state !== last.current;
  useEffect(() => {
    if (justSucceeded && state.message) toast.success(state.message);
    last.current = state;
  }, [state, justSucceeded]);
  return justSucceeded;
}

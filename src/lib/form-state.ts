/**
 * Client-safe form utilities shared by server actions and useActionState
 * components. Server-only helpers (request metadata) live in
 * `@/server/form.ts`.
 */

/** Common state shape for useActionState-driven forms. */
export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const IDLE_FORM_STATE: FormState = { status: "idle" };

/** Flattened Zod field errors, undefined when there are none. */
export function zodFieldErrors(error: unknown): Record<string, string[]> | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "flatten" in error &&
    typeof (error as { flatten: () => { fieldErrors: Record<string, string[]> } }).flatten ===
      "function"
  ) {
    const flat = (error as { flatten: () => { fieldErrors: Record<string, string[]> } }).flatten();
    return Object.keys(flat.fieldErrors).length > 0 ? flat.fieldErrors : undefined;
  }
  return undefined;
}

/**
 * Sanitizes a post-login "next" path: must stay on-site.
 * Returns null when the value is missing or unsafe.
 */
export function safeRedirectPath(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

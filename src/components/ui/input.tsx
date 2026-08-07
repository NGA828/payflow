import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        "h-[38px] w-full rounded-lg border bg-white px-3 text-[13.5px] text-ink shadow-none transition-colors placeholder:text-muted",
        "focus:outline-none focus:ring-3",
        error
          ? "border-danger focus:border-danger focus:ring-danger-tint"
          : "border-border focus:border-primary-600 focus:ring-indigo-100",
        "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-muted",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };

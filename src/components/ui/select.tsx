import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          "h-[38px] w-full appearance-none rounded-lg border bg-white pr-9 pl-3 text-[13.5px] text-ink shadow-none transition-colors",
          "focus:outline-none focus:ring-3",
          error
            ? "border-danger focus:border-danger focus:ring-danger-tint"
            : "border-border focus:border-primary-600 focus:ring-indigo-100",
          "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-muted",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };

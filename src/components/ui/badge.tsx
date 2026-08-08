import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold tracking-wide",
  {
    variants: {
      variant: {
        grey: "bg-slate-100 text-slate-500",
        indigo: "bg-indigo-50 text-primary-700",
        teal: "bg-teal-50 text-teal-700",
        green: "bg-success-tint text-success",
        amber: "bg-warning-tint text-warning",
        red: "bg-danger-tint text-danger",
        blue: "bg-info-tint text-info",
        dark: "bg-ink text-white",
        outline: "border border-border bg-white text-body",
      },
    },
    defaultVariants: { variant: "grey" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };

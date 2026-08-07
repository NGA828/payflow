import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white shadow-sm hover:bg-primary-700",
        teal: "bg-teal-600 text-white shadow-sm hover:bg-teal-700",
        secondary: "border border-border bg-white text-ink shadow-sm hover:border-slate-300 hover:bg-canvas",
        ghost: "text-body hover:bg-slate-100 hover:text-ink",
        destructive: "bg-danger text-white shadow-sm hover:bg-[#b91c1c]",
        link: "text-primary-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-[38px] px-4",
        lg: "h-11 rounded-[10px] px-5 text-[15px]",
        icon: "h-[38px] w-[38px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };

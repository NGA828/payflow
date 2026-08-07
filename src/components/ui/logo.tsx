import { cn } from "@/lib/utils";

/** PayFlow logo mark: indigo→teal gradient rounded square with a cashflow pulse. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id="pf-lg" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#0D9488" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#pf-lg)" />
      <path
        d="M9 21.5c3-1 4.5-6.5 7-7s4 5.5 7 4.5"
        stroke="#fff"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="9" cy="21" r="2.1" fill="#fff" />
      <circle cx="23" cy="16" r="2.1" fill="#fff" />
    </svg>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-7 w-7" />
      <span className={cn("text-[17px] font-bold tracking-tight", dark ? "text-white" : "text-ink")}>
        PayFlow
      </span>
    </span>
  );
}

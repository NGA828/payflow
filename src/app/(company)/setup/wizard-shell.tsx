import Link from "next/link";
import { Check } from "lucide-react";
import { SETUP_STEPS } from "@/server/services/setup.service";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";

/**
 * Setup wizard frame: left step rail (desktop), progress bar, content slot.
 * Server-rendered — individual steps mount client forms inside.
 */
export function WizardShell({
  currentStep,
  highestReached,
  children,
}: {
  currentStep: number;
  highestReached: number;
  children: React.ReactNode;
}) {
  const progressPct = Math.round(((currentStep - 1) / SETUP_STEPS.length) * 100);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between lg:hidden">
        <Logo />
      </div>

      <div>
        <h1 className="text-xl font-bold text-ink">Workspace setup</h1>
        <p className="mt-1 text-[13px] text-muted">
          Step {currentStep} of {SETUP_STEPS.length} — you can leave and come back anytime.
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="brand-gradient h-full rounded-full transition-all"
            style={{ width: `${Math.max(progressPct, 4)}%` }}
          />
        </div>
      </div>

      <div className="flex gap-6">
        <ol className="hidden w-60 shrink-0 flex-col gap-1 lg:flex" aria-label="Setup steps">
          {SETUP_STEPS.map((step) => {
            const done = step.n < currentStep;
            const current = step.n === currentStep;
            const reachable = step.n <= highestReached;
            const inner = (
              <>
                <span
                  className={cn(
                    "grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[11.5px] font-bold",
                    done && "bg-success-tint text-success",
                    current && "brand-gradient text-white",
                    !done && !current && "bg-slate-100 text-muted",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step.n}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-[13px] font-medium",
                      current ? "text-ink" : done ? "text-body" : "text-muted",
                    )}
                  >
                    {step.title}
                  </span>
                  {step.optional && (
                    <span className="text-[11px] text-muted">Optional</span>
                  )}
                </span>
              </>
            );
            return (
              <li key={step.n}>
                {reachable && !current ? (
                  <Link
                    href={`/setup?step=${step.n}`}
                    className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2",
                      current && "border border-border bg-white shadow-card",
                    )}
                    aria-current={current ? "step" : undefined}
                  >
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

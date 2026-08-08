import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PayrollPeriodStatus } from "@prisma/client";
import { statusBadgeVariant, statusLabel } from "@/lib/payroll-ui";
import { cn } from "@/lib/utils";

/** Shared header for period-scoped pages (overview, adjustments, payslips…). */
export function PeriodPageHeader({
  periodId,
  name,
  status,
  dateRange,
  active,
  actions,
}: {
  periodId: string;
  name: string;
  status: PayrollPeriodStatus;
  dateRange: string;
  active: "overview" | "adjustments";
  actions?: React.ReactNode;
}) {
  const tabs = [
    { id: "overview", label: "Overview", href: `/payroll/${periodId}` },
    { id: "adjustments", label: "Adjustments", href: `/payroll/${periodId}/adjustments` },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/payroll"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Back to payroll
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold text-ink">{name}</h1>
          <Badge variant={statusBadgeVariant(status)} dot>
            {statusLabel(status)}
          </Badge>
        </div>
        {actions}
      </div>
      <p className="tnum -mt-1 text-[13px] text-muted">{dateRange}</p>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active === tab.id ? "page" : undefined}
            className={cn(
              "border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors",
              active === tab.id
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { Card, CardContent } from "@/components/ui/card";
import { createPeriodAction } from "@/features/payroll/actions";
import { PeriodForm } from "../period-form";

export const metadata: Metadata = { title: "New payroll period" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Only Accountants open payroll periods</h1>
          <p className="mt-2 text-[13px] text-body">
            Periods are created and processed by the Accountant role. Company Admins approve them
            afterwards from the period page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function NewPeriodPage() {
  try {
    await requireCompanyPermission(PERMISSIONS.PAYROLL_PERIODS_MANAGE);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  // Sensible defaults: the current calendar month, paid on the 5th of the next.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const pay = new Date(Date.UTC(year, month + 1, 5));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/payroll"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Back to payroll
      </Link>
      <Card>
        <div className="border-b border-border px-6 py-4">
          <h1 className="text-lg font-bold text-ink">New payroll period</h1>
          <p className="mt-1 text-[13px] text-muted">
            The name is set automatically — e.g. “August 2026”.
          </p>
        </div>
        <CardContent className="pt-5">
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-info/25 bg-info-tint px-3.5 py-2.5 text-[12.5px] text-info">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Periods may never overlap, and only one period can be in preparation at a time —
            submit the current one for approval before opening the next.
          </div>
          <PeriodForm
            action={createPeriodAction}
            defaults={{ startDate: isoDay(start), endDate: isoDay(end), payDate: isoDay(pay) }}
            submitLabel="Create period"
            cancelHref="/payroll"
          />
        </CardContent>
      </Card>
    </div>
  );
}

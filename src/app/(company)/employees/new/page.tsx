import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronLeft } from "lucide-react";
import { AppError } from "@/server/errors";
import { getDb } from "@/lib/db";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { createEmployeeAction } from "@/features/employees/actions";
import { EmployeeForm, type DepartmentOption } from "@/features/employees/employee-form";

export const metadata: Metadata = { title: "Add employee" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">You cannot manage employees</h1>
          <p className="mt-2 text-[13px] text-body">
            Only Company Admins and HR Managers can add employee records.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function NewEmployeePage() {
  try {
    await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
  const departments = await getDb().department.findMany({
    where: { companyId: ctx.company.id, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      positions: {
        where: { status: "ACTIVE" },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      },
    },
  });
  const options: DepartmentOption[] = departments.filter((d) => d.positions.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/employees"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Back to employees
      </Link>

      {options.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
              <Building2 className="h-5.5 w-5.5 text-primary-600" strokeWidth={1.7} />
            </span>
            <h1 className="text-lg font-bold text-ink">Set up your organization first</h1>
            <p className="mt-2 max-w-sm text-[13px] text-body">
              Employees need a position inside a department. Create at least one department and
              position, then come back to add your team.
            </p>
            <Link href="/organization" className={buttonVariants({ variant: "primary", size: "sm" }) + " mt-5"}>
              Go to Departments
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="border-b border-border px-6 py-4">
            <h1 className="text-lg font-bold text-ink">Add employee</h1>
            <p className="mt-1 text-[13px] text-muted">
              An employee code is assigned automatically (PB-0001, PB-0002, …).
            </p>
          </div>
          <CardContent className="pt-5">
            <EmployeeForm
              action={createEmployeeAction}
              departments={options}
              submitLabel="Create employee"
              cancelHref="/employees"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

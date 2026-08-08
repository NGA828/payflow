import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AppError } from "@/server/errors";
import { getDb } from "@/lib/db";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getEmployeeDetail } from "@/server/services/employee.service";
import { Card, CardContent } from "@/components/ui/card";
import { updateEmployeeAction } from "@/features/employees/actions";
import { EmployeeForm, type DepartmentOption } from "@/features/employees/employee-form";

export const metadata: Metadata = { title: "Edit employee" };
export const dynamic = "force-dynamic";

function dateInputValue(date: Date | null): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">You cannot manage employees</h1>
          <p className="mt-2 text-[13px] text-body">
            Only Company Admins and HR Managers can edit employee records.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const { id } = await params;
  const [employee, departments] = await Promise.all([
    getEmployeeDetail(ctx.company.id, id, false),
    getDb().department.findMany({
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
    }),
  ]);
  if (!employee) notFound();

  // Keep the currently-held position selectable even if it was archived since.
  const options: DepartmentOption[] = departments.filter((d) => d.positions.length > 0);
  const positionListed = options.some((d) => d.positions.some((p) => p.id === employee.positionId));
  if (!positionListed) {
    options.push({
      id: employee.departmentId,
      name: `${employee.departmentName} (archived)`,
      positions: [{ id: employee.positionId, title: `${employee.positionTitle} (archived)` }],
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={`/employees/${employee.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Back to profile
      </Link>
      <Card>
        <div className="border-b border-border px-6 py-4">
          <h1 className="text-lg font-bold text-ink">
            Edit {employee.fullName} <span className="tnum ml-1 text-xs font-medium text-muted">{employee.employeeCode}</span>
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Payment details live on the profile’s Payment tab and are stored encrypted.
          </p>
        </div>
        <CardContent className="pt-5">
          <EmployeeForm
            action={updateEmployeeAction}
            departments={options}
            employeeId={employee.id}
            submitLabel="Save changes"
            cancelHref={`/employees/${employee.id}`}
            defaults={{
              firstName: employee.firstName,
              lastName: employee.lastName,
              dateOfBirth: dateInputValue(employee.dateOfBirth),
              nationalId: employee.nationalId ?? undefined,
              phone: employee.phone ?? undefined,
              email: employee.email ?? undefined,
              positionId: employee.positionId,
              dateHired: dateInputValue(employee.dateHired),
              employmentType: employee.employmentType,
              basicSalary: employee.basicSalary,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

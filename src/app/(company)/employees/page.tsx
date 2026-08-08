import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, Users, UserRoundPlus, WalletCards } from "lucide-react";
import { AppError } from "@/server/errors";
import { getDb } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { listEmployees } from "@/server/services/employee.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { employeeDirectoryQuerySchema } from "@/validations/employee";
import { EMPLOYMENT_TYPE_LABELS } from "@/features/employees/employee-form";
import { DirectoryRowActions } from "./client";

export const metadata: Metadata = { title: "Employees" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">The employee directory is restricted</h1>
          <p className="mt-2 text-[13px] text-body">
            Your role does not include access to employee records. Ask a Company Admin if you
            believe this is a mistake.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  TERMINATED: "Terminated",
  ALL: "All statuses",
};

function statusBadge(status: "ACTIVE" | "INACTIVE" | "TERMINATED") {
  if (status === "ACTIVE") return <Badge variant="green" dot>Active</Badge>;
  if (status === "INACTIVE") return <Badge variant="amber" dot>Inactive</Badge>;
  return <Badge variant="grey" dot>Terminated</Badge>;
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const canManage = hasPermission(ctx.membership.role, PERMISSIONS.EMPLOYEES_MANAGE);
  const canSeeSensitive = hasPermission(ctx.membership.role, PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE);

  const params = await searchParams;
  const query = employeeDirectoryQuerySchema.parse({
    search: typeof params.q === "string" && params.q !== "" ? params.q : undefined,
    status: typeof params.status === "string" ? params.status : "ACTIVE",
    departmentId:
      typeof params.departmentId === "string" && params.departmentId !== ""
        ? params.departmentId
        : undefined,
    page: typeof params.page === "string" ? params.page : 1,
  });

  const [directory, departments] = await Promise.all([
    listEmployees(ctx, query, canSeeSensitive),
    getDb().department.findMany({
      where: { companyId: ctx.company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const hasAnyEmployees =
    (await getDb().employee.count({ where: { companyId: ctx.company.id } })) > 0;
  const filtersActive = Boolean(query.search) || query.departmentId !== undefined;

  const hrefForPage = (page: number) => {
    const qs = new URLSearchParams();
    if (query.search) qs.set("q", query.search);
    if (query.status !== "ACTIVE") qs.set("status", query.status);
    if (query.departmentId) qs.set("departmentId", query.departmentId);
    if (page > 1) qs.set("page", String(page));
    const str = qs.toString();
    return `/employees${str ? `?${str}` : ""}`;
  };

  const showingFrom = directory.total === 0 ? 0 : (directory.page - 1) * directory.pageSize + 1;
  const showingTo = Math.min(directory.page * directory.pageSize, directory.total);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Employees</h1>
          <p className="mt-1 text-[13px] text-muted">
            {formatNumber(directory.total)} {query.status === "ALL" ? "total" : query.status.toLowerCase()}{" "}
            {directory.total === 1 ? "employee" : "employees"}
          </p>
        </div>
        {canManage && (
          <Link href="/employees/new" className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" /> Add employee
          </Link>
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/employees" className="flex flex-wrap items-center gap-2.5 border-b border-border bg-canvas/70 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              name="q"
              defaultValue={query.search}
              placeholder="Search name, code or email…"
              className="pl-9"
              aria-label="Search employees"
            />
          </div>
          <Select name="status" defaultValue={query.status} className="w-[150px]" aria-label="Filter by status">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select name="departmentId" defaultValue={query.departmentId ?? ""} className="w-[180px]" aria-label="Filter by department">
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "md" })}>
            Apply
          </button>
        </form>

        {directory.items.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
              <Users className="h-5.5 w-5.5 text-primary-600" strokeWidth={1.7} />
            </span>
            {hasAnyEmployees || filtersActive ? (
              <>
                <p className="text-[13.5px] font-semibold text-ink">No employees match</p>
                <p className="mt-1 max-w-xs text-[12.5px] text-body">
                  Try a different search or reset the filters.
                </p>
                <Link href="/employees" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-4")}>
                  Clear filters
                </Link>
              </>
            ) : (
              <>
                <p className="text-[13.5px] font-semibold text-ink">No employees yet</p>
                <p className="mt-1 max-w-xs text-[12.5px] text-body">
                  Add your first employee to start building payroll. You can import a CSV later.
                </p>
                {canManage && (
                  <Link href="/employees/new" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-4")}>
                    <UserRoundPlus className="h-3.5 w-3.5" /> Add employee
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                    <th className="py-2.5 pr-4 pl-5">Employee</th>
                    <th className="px-4 py-2.5">Department · Position</th>
                    <th className="px-4 py-2.5">Type</th>
                    {canSeeSensitive && <th className="px-4 py-2.5 text-right">Salary</th>}
                    <th className="px-4 py-2.5">Payment</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Hired</th>
                    <th className="py-2.5 pr-5 pl-4 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {directory.items.map((employee) => (
                    <tr key={employee.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60">
                      <td className="py-3 pr-4 pl-5">
                        <div className="flex items-center gap-2.5">
                          <span className="brand-gradient grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white">
                            {`${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-ink">
                              <Link href={`/employees/${employee.id}`} className="hover:text-primary-700 hover:underline">
                                {employee.fullName}
                              </Link>
                            </p>
                            <p className="tnum truncate text-xs text-muted">{employee.employeeCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate text-[13px] text-ink">{employee.departmentName}</p>
                        <p className="truncate text-xs text-muted">{employee.positionTitle}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</Badge>
                      </td>
                      {canSeeSensitive && (
                        <td className="tnum px-4 py-3 text-right text-[13px] font-medium text-ink">
                          {employee.basicSalary ? formatMoney(employee.basicSalary) : "—"}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {employee.paymentComplete ? (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success">
                            <WalletCards className="h-3.5 w-3.5" /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-warning">
                            <WalletCards className="h-3.5 w-3.5" /> Missing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{statusBadge(employee.status)}</td>
                      <td className="tnum px-4 py-3 text-[13px] text-muted">{formatDate(employee.dateHired)}</td>
                      <td className="py-3 pr-4 pl-4 text-right">
                        {canManage ? (
                          <DirectoryRowActions
                            employee={{ id: employee.id, fullName: employee.fullName, status: employee.status }}
                          />
                        ) : (
                          <Link href={`/employees/${employee.id}`} className="text-[12.5px] font-medium text-primary-600 hover:underline">
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-canvas/70 px-5 py-3">
              <p className="tnum text-[12.5px] text-muted">
                Showing {showingFrom}–{showingTo} of {formatNumber(directory.total)} employees
              </p>
              <div className="flex items-center gap-1.5">
                {directory.page > 1 && (
                  <Link href={hrefForPage(directory.page - 1)} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label="Previous page">
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Link>
                )}
                <span className="tnum px-2 text-[12.5px] text-body">
                  Page {directory.page} / {directory.totalPages}
                </span>
                {directory.page < directory.totalPages && (
                  <Link href={hrefForPage(directory.page + 1)} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label="Next page">
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

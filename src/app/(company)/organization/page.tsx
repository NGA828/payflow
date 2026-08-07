import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Building2, ChevronRight, Layers, Users } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { listDepartmentsWithStats, type DepartmentListItem } from "@/server/services/org.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { DepartmentRowActions } from "./client";
import { NewDepartmentButton } from "./client";

export const metadata: Metadata = { title: "Departments" };
export const dynamic = "force-dynamic";

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-14 text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
          <Building2 className="h-6 w-6 text-primary-600" strokeWidth={1.7} />
        </span>
        <h2 className="text-[15px] font-bold text-ink">No departments yet</h2>
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-body">
          Departments group your positions and employees — Operations, Finance, Engineering.
          Create the first one to start mapping your organization.
        </p>
        <div className="mt-5">
          <NewDepartmentButton />
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentTable({ departments, archived }: { departments: DepartmentListItem[]; archived?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-border bg-canvas/70 text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
              <th className="py-2.5 pr-4 pl-5">Department</th>
              <th className="px-4 py-2.5">Positions</th>
              <th className="px-4 py-2.5">Employees</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Created</th>
              <th className="py-2.5 pr-5 pl-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <tr
                key={dept.id}
                className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60"
              >
                <td className="py-3 pr-4 pl-5">
                  <Link
                    href={`/organization/departments/${dept.id}`}
                    className="group flex items-center gap-2 font-semibold text-ink"
                  >
                    <span className="max-w-[220px] truncate text-[13.5px] group-hover:text-primary-600">
                      {dept.name}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600" />
                  </Link>
                  {dept.description && (
                    <p className="mt-0.5 max-w-[280px] truncate text-xs text-muted">
                      {dept.description}
                    </p>
                  )}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-body">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-muted" />
                    {dept.activePositions}
                  </span>
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-body">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted" />
                    {dept.activeEmployees}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {dept.status === "ACTIVE" ? (
                    <Badge variant="green" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="amber" dot>
                      Archived
                    </Badge>
                  )}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-muted">{formatDate(dept.createdAt)}</td>
                <td className="py-3 pr-4 pl-4 text-right">
                  <DepartmentRowActions
                    department={{
                      id: dept.id,
                      name: dept.name,
                      description: dept.description,
                      status: dept.status,
                      totalEmployees: dept.totalEmployees,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {archived && (
        <p className="flex items-center gap-1.5 border-t border-slate-100 bg-canvas/50 px-5 py-2.5 text-[12px] text-muted">
          <Archive className="h-3.5 w-3.5" />
          Archived departments keep history but are hidden from new assignments.
        </p>
      )}
    </Card>
  );
}

export default async function OrganizationPage() {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.ORG_MANAGE);
  } catch (error) {
    if (error instanceof AppError) {
      return (
        <div className="mx-auto max-w-lg pt-16 text-center">
          <Card>
            <CardContent className="py-8">
              <h1 className="text-lg font-bold text-ink">Organization is an HR space</h1>
              <p className="mt-2 text-[13px] text-body">
                Only Company Admins and HR Managers can manage departments and positions.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    throw error;
  }

  const all = await listDepartmentsWithStats(ctx.company.id);
  const active = all.filter((d) => d.status === "ACTIVE");
  const archived = all.filter((d) => d.status === "ARCHIVED");
  const totalPositions = active.reduce((sum, d) => sum + d.activePositions, 0);
  const totalEmployees = active.reduce((sum, d) => sum + d.activeEmployees, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Organization</h1>
          <p className="mt-1 text-[13px] text-muted">
            {active.length} department{active.length === 1 ? "" : "s"} · {totalPositions} positions ·{" "}
            {totalEmployees} employees
          </p>
        </div>
        {active.length > 0 && <NewDepartmentButton />}
      </div>

      {active.length === 0 ? (
        <EmptyState />
      ) : (
        <DepartmentTable departments={active} />
      )}

      {archived.length > 0 && (
        <div>
          <h2 className="mb-2 text-[13px] font-semibold text-muted">
            Archived ({archived.length})
          </h2>
          <DepartmentTable departments={archived} archived />
        </div>
      )}
    </div>
  );
}

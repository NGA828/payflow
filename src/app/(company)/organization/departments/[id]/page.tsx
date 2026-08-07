import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, BriefcaseBusiness, Layers, Users } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getDepartmentDetail } from "@/server/services/org.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { DepartmentRowActions, NewPositionButton, PositionRowActions } from "../../client";

export const metadata: Metadata = { title: "Department" };
export const dynamic = "force-dynamic";

function PositionsEmpty({ departmentId }: { departmentId: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50">
        <BriefcaseBusiness className="h-5 w-5 text-primary-600" strokeWidth={1.7} />
      </span>
      <h3 className="text-[14px] font-bold text-ink">No positions yet</h3>
      <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-body">
        Positions are the job titles employees hold in this department.
      </p>
      <div className="mt-4">
        <NewPositionButton departmentId={departmentId} />
      </div>
    </div>
  );
}

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const department = await getDepartmentDetail(ctx.company.id, id);
  if (!department) notFound();

  const active = department.positions.filter((p) => p.status === "ACTIVE");
  const archivedPositions = department.positions.filter((p) => p.status === "ARCHIVED");
  const isArchived = department.status === "ARCHIVED";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/organization"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All departments
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-ink">{department.name}</h1>
              {isArchived && (
                <Badge variant="amber" dot>
                  Archived
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {department.description ?? "No description"} · {department.activeEmployees} active
              employee{department.activeEmployees === 1 ? "" : "s"} · created{" "}
              {formatDate(department.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DepartmentRowActions
              department={{
                id: department.id,
                name: department.name,
                description: department.description,
                status: department.status,
                totalEmployees: department.totalEmployees,
              }}
              fromDetail
            />
            {!isArchived && <NewPositionButton departmentId={department.id} />}
          </div>
        </div>
      </div>

      {isArchived && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#FEF3C7] bg-warning-tint px-4 py-3 text-[13px] text-[#92400E]">
          <Archive className="h-4 w-4 shrink-0" />
          This department is archived — it and its positions are hidden from new assignments.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">
            Positions ({active.length})
          </h2>
        </div>
        {active.length === 0 && archivedPositions.length === 0 ? (
          <PositionsEmpty departmentId={department.id} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" /> Title
                    </span>
                  </th>
                  <th className="px-4 py-2.5">Employees</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Created</th>
                  <th className="py-2.5 pr-5 pl-4 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...active, ...archivedPositions].map((position) => (
                  <tr
                    key={position.id}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60"
                  >
                    <td className="py-3 pr-4 pl-5">
                      <span className="text-[13.5px] font-semibold text-ink">{position.title}</span>
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-body">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted" />
                        {position.activeEmployees}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {position.status === "ACTIVE" ? (
                        <Badge variant="green" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="amber" dot>
                          Archived
                        </Badge>
                      )}
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-muted">
                      {formatDate(position.createdAt)}
                    </td>
                    <td className="py-3 pr-4 pl-4 text-right">
                      <PositionRowActions
                        position={{
                          id: position.id,
                          departmentId: department.id,
                          title: position.title,
                          status: position.status,
                          totalEmployees: position.totalEmployees,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

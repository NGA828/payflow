import type { Metadata } from "next";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getDb } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card><CardContent className="py-8">
        <h1 className="text-lg font-bold text-ink">Audit log is restricted</h1>
        <p className="mt-2 text-[13px] text-body">Your role does not include audit access.</p>
      </CardContent></Card>
    </div>
  );
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.AUDIT_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const perPage = 50;
  const db = getDb();

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where: { companyId: ctx.company.id },
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
      include: { user: { select: { fullName: true, email: true } } },
    }),
    db.auditLog.count({ where: { companyId: ctx.company.id } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Audit log</h1>
        <p className="mt-1 text-[13px] text-muted">{total} events · immutable trail for compliance</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-border bg-canvas/70 text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Time</th>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Entity</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="tnum py-2.5 pr-4 pl-5 text-[12.5px] text-body">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-ink">{log.user?.fullName ?? "—"}</p>
                    <p className="text-[11.5px] text-muted">{log.user?.email ?? log.userId ?? "system"}</p>
                  </td>
                  <td className="px-4 py-2.5"><Badge variant="grey">{log.action}</Badge></td>
                  <td className="px-4 py-2.5 text-[12.5px] text-body">{log.entityType ? `${log.entityType}${log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}` : "—"}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-muted">
                    {log.metadata ? (
                      <pre className="max-w-[260px] overflow-hidden truncate whitespace-pre-wrap">{JSON.stringify(log.metadata, null, 0).slice(0, 200)}</pre>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && (
          <CardContent className="py-8 text-center">
            <p className="text-[13px] text-muted">No audit events yet.</p>
          </CardContent>
        )}
        <div className="flex items-center justify-between border-t border-border bg-canvas/50 px-5 py-3 text-[12.5px] text-muted">
          <span>Page {page} of {totalPages} · {total} events</span>
          <div className="flex gap-2">
            {page > 1 && <a href={`/audit-log?page=${page - 1}`} className="rounded-lg border border-border bg-white px-3 py-1 font-medium hover:bg-canvas">Prev</a>}
            {page < totalPages && <a href={`/audit-log?page=${page + 1}`} className="rounded-lg border border-border bg-white px-3 py-1 font-medium hover:bg-canvas">Next</a>}
          </div>
        </div>
      </Card>
    </div>
  );
}

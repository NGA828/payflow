import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const perPage = 25;
  const db = getDb();

  const where: { name?: { contains: string; mode: "insensitive" }; status?: "TRIAL" | "ACTIVE" | "SUSPENDED" | "READ_ONLY" } = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (status && ["TRIAL", "ACTIVE", "SUSPENDED", "READ_ONLY"].includes(status)) where.status = status as "TRIAL" | "ACTIVE" | "SUSPENDED" | "READ_ONLY";

  const [companies, total] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, name: true, status: true, createdAt: true, trialEndsAt: true, _count: { select: { employees: true, memberships: true } } },
    }),
    db.company.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Companies</h1>
          <p className="mt-1 text-[13px] text-muted">{total} companies</p>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <form method="GET" className="flex flex-wrap gap-2">
            <input name="q" defaultValue={q} placeholder="Search by name" className="h-8 rounded-lg border border-border bg-white px-3 text-[13px]" />
            <select name="status" defaultValue={status} className="h-8 rounded-lg border border-border bg-white px-2 text-[13px]">
              <option value="">All statuses</option>
              <option value="TRIAL">Trial</option>
              <option value="ACTIVE">Active</option>
              <option value="READ_ONLY">Read-only</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <button type="submit" className="h-8 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-white">Filter</button>
            {q || status ? <Link href="/admin/companies" className="h-8 inline-flex items-center rounded-lg border border-border bg-white px-3 text-[12.5px]">Clear</Link> : null}
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-border bg-canvas/70 text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Company</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5">Trial ends</th>
                <th className="px-4 py-2.5 text-right">Employees</th>
                <th className="px-4 py-2.5 text-right">Members</th>
                <th className="py-2.5 pr-5 pl-4 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5 text-[13.5px] font-semibold text-ink">{c.name}</td>
                  <td className="px-4 py-3"><Badge variant={c.status === "ACTIVE" ? "teal" : c.status === "TRIAL" ? "amber" : c.status === "SUSPENDED" ? "red" : "amber"} dot>{c.status}</Badge></td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(c.createdAt)}</td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{c.trialEndsAt ? formatDate(c.trialEndsAt) : "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{c._count.employees}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{c._count.memberships}</td>
                  <td className="py-3 pr-5 pl-4 text-right">
                    <Link href={`/admin/companies/${c.id}`} className="text-[12.5px] font-medium text-primary-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border bg-canvas/50 px-5 py-3 text-[12.5px] text-muted">
          <span>Page {page} of {totalPages} · {total} companies</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/admin/companies?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`} className="rounded-lg border border-border bg-white px-3 py-1 font-medium hover:bg-canvas">Prev</Link>}
            {page < totalPages && <Link href={`/admin/companies?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`} className="rounded-lg border border-border bg-white px-3 py-1 font-medium hover:bg-canvas">Next</Link>}
          </div>
        </div>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileSpreadsheet, FileText, Filter, BarChart3, TrendingUp, Clock, Gift, Receipt, User, FileStack } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportType } from "@/server/services/report.service";

type ReportOption = {
  id: ReportType;
  label: string;
  icon: typeof BarChart3;
  desc: string;
};

const REPORT_OPTIONS: ReportOption[] = [
  { id: "summary", label: "Summary", icon: FileStack, desc: "Period totals, gross, deductions, net" },
  { id: "by-dept", label: "By Department", icon: BarChart3, desc: "Cost breakdown per department" },
  { id: "trend", label: "Trend", icon: TrendingUp, desc: "Net payroll over time" },
  { id: "overtime", label: "Overtime", icon: Clock, desc: "OT hours and pay per employee" },
  { id: "bonuses", label: "Bonuses", icon: Gift, desc: "Bonus totals and distribution" },
  { id: "deductions", label: "Deductions", icon: Receipt, desc: "Loans, advances, penalties, tax" },
  { id: "per-employee", label: "Per Employee", icon: User, desc: "History per employee across periods" },
];

function compactTick(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

const AXIS_STYLE = { fill: "#94A3B8", fontSize: 11, fontFamily: "inherit" } as const;

export function FiltersBar({
  departments,
  employees,
  periods,
  canExport,
}: {
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; firstName: string; lastName: string; employeeCode: string }>;
  periods: Array<{ id: string; name: string }>;
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [departmentId, setDepartmentId] = useState(searchParams.get("departmentId") ?? "");
  const [employeeId, setEmployeeId] = useState(searchParams.get("employeeId") ?? "");
  const [periodId, setPeriodId] = useState(searchParams.get("periodId") ?? "");

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    if (departmentId) params.set("departmentId", departmentId);
    else params.delete("departmentId");
    if (employeeId) params.set("employeeId", employeeId);
    else params.delete("employeeId");
    if (periodId) params.set("periodId", periodId);
    else params.delete("periodId");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    params.delete("departmentId");
    params.delete("employeeId");
    params.delete("periodId");
    setFrom("");
    setTo("");
    setDepartmentId("");
    setEmployeeId("");
    setPeriodId("");
    router.push(`${pathname}?${params.toString()}`);
  }

  const currentReport = (searchParams.get("report") as ReportType) || "summary";
  const exportBase = `/reports/export?${searchParams.toString()}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
          <Filter className="h-4 w-4 text-muted" /> Filters — finalized periods only (APPROVED / PAID / LOCKED)
        </div>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">From (start date)</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">To (end date)</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="h-8 rounded-lg border border-border bg-white px-2 text-[13px] text-ink focus:border-primary-600 focus:outline-none focus:ring-3 focus:ring-indigo-100"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">Employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-8 rounded-lg border border-border bg-white px-2 text-[13px] text-ink focus:border-primary-600 focus:outline-none focus:ring-3 focus:ring-indigo-100"
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.employeeCode} · {e.firstName} {e.lastName}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted">Period</label>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="h-8 rounded-lg border border-border bg-white px-2 text-[13px] text-ink focus:border-primary-600 focus:outline-none focus:ring-3 focus:ring-indigo-100"
            >
              <option value="">All finalized</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" size="sm" onClick={apply} className="h-8">Apply</Button>
            <Button variant="ghost" size="sm" onClick={clear} className="h-8">Clear</Button>
          </div>
        </div>
        {canExport && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Link
              href={`${exportBase}&format=excel&report=${currentReport}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[12.5px] font-medium shadow-sm hover:bg-canvas"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Link>
            <Link
              href={`${exportBase}&format=pdf&report=${currentReport}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-[12.5px] font-medium shadow-sm hover:bg-canvas"
            >
              <FileText className="h-4 w-4" /> Export PDF
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportTabs() {
  const searchParams = useSearchParams();
  const current = (searchParams.get("report") as ReportType) || "summary";

  function hrefFor(id: ReportType) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", id);
    return `/reports?${params.toString()}`;
  }

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border">
      {REPORT_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = current === opt.id;
        return (
          <Link
            key={opt.id}
            href={hrefFor(opt.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors",
              active ? "border-primary-600 text-primary-700" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" /> {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

export function KpiGrid({ kpis }: { kpis: Array<{ label: string; value: string; sub?: string; tint?: string }> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="py-4">
            <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{kpi.label}</p>
            <p className="tnum mt-1 text-[17px] font-bold text-ink">{kpi.value}</p>
            {kpi.sub && <p className="mt-0.5 text-[11.5px] text-muted">{kpi.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DeptBarChart({ data }: { data: Array<{ name: string; net: number }> }) {
  if (data.length === 0) return <p className="py-8 text-center text-[12.5px] text-muted">No department data for the selected filters.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={compactTick} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ ...AXIS_STYLE, fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#F8FAFC" }} formatter={(value) => [formatMoney(value as number), "Net"] as const} />
        <Bar dataKey="net" fill="#4F46E5" radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data }: { data: Array<{ label: string; net: number; name: string }> }) {
  if (data.length === 0) return <p className="py-8 text-center text-[12.5px] text-muted">No periods yet — finalized payroll will appear here.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} dy={6} />
        <YAxis tickFormatter={compactTick} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          cursor={{ stroke: "#CBD5E1", strokeDasharray: "3 3" }}
          formatter={(value, _name, item) => [formatMoney(value as number), (item as { payload?: { name?: string } })?.payload?.name ?? "Net"] }
          labelFormatter={(label) => `Period: ${label}`}
        />
        <Line type="monotone" dataKey="net" stroke="#0D9488" strokeWidth={2.5} isAnimationActive={false} dot={{ r: 3.5, fill: "#0D9488" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

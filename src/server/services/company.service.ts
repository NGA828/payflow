import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { audit } from "@/server/security/audit";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";
import type { CompanyInfoInput, PayrollSettingsInput } from "@/validations/company";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Changed top-level keys, recorded in the audit entry's metadata. */
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const norm = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : String(n);
  };
  return Object.keys(after).filter((key) => norm(before[key]) !== norm(after[key]));
}

/** Percent (0–100, ≤2dp) -> exact fraction string (0–1, 4dp) for the DB. */
export function percentToFraction(percent: number): string {
  const hundredths = Math.round(percent * 100); // integer math only
  return (hundredths / 10_000).toFixed(4);
}

/** Company profile: legal name, address, tax ID, launch market. */
export async function updateCompanyInfo(
  ctx: CompanyContext,
  input: CompanyInfoInput,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const before = ctx.company;

  const data: Prisma.CompanyUpdateInput = {
    name: input.name,
    country: input.country,
    address: input.address ?? null,
    taxId: input.taxId ?? null,
  };
  await db.company.update({ where: { id: ctx.company.id }, data });

  const fields = changedKeys(
    { name: before.name, country: before.country, address: before.address, taxId: before.taxId },
    { name: data.name, country: input.country, address: data.address, taxId: data.taxId },
  );
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "company.updated",
    entityType: "Company",
    entityId: ctx.company.id,
    metadata: { section: "profile", fields },
    ...meta,
  });
}

/** Payroll configuration: frequency, work week, overtime multiplier, tax rate. */
export async function updatePayrollSettings(
  ctx: CompanyContext,
  input: PayrollSettingsInput,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const before = ctx.company;

  const data: Prisma.CompanyUpdateInput = {
    payrollFrequency: input.payrollFrequency,
    standardHoursPerWeek: input.standardHoursPerWeek.toFixed(2),
    overtimeMultiplier: input.overtimeMultiplier.toFixed(2),
    taxRate: percentToFraction(input.taxRatePercent),
  };
  await db.company.update({ where: { id: ctx.company.id }, data });

  const fields = changedKeys(
    {
      payrollFrequency: before.payrollFrequency,
      standardHoursPerWeek: before.standardHoursPerWeek,
      overtimeMultiplier: before.overtimeMultiplier,
      taxRate: before.taxRate,
    },
    {
      payrollFrequency: input.payrollFrequency,
      standardHoursPerWeek: data.standardHoursPerWeek,
      overtimeMultiplier: data.overtimeMultiplier,
      taxRate: data.taxRate,
    },
  );
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "company.updated",
    entityType: "Company",
    entityId: ctx.company.id,
    metadata: { section: "payroll_settings", fields },
    ...meta,
  });
}

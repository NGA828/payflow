import archiver from "archiver";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/server/email";
import { payslipAvailableEmail } from "@/server/email/templates";
import { AppError } from "@/server/errors";
import { slugifyFileStem } from "@/server/files/slug";
import { renderPayslipPdf } from "@/server/payslips/payslip-document";
import { buildPayslipView, type PayslipViewInput } from "@/server/payslips/payslip-view";
import { audit } from "@/server/security/audit";
import type { CompanyContext } from "@/server/tenant/context";
import { SUPPORTED_COUNTRIES } from "@/validations/company";
import { formatDate } from "@/lib/format";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PayslipPdfDownload {
  pdf: Buffer;
  filename: string;
  payslipNumber: string;
}

export interface PayslipZipDownload {
  zip: Buffer;
  filename: string;
  count: number;
}

type PayslipWithContext = Awaited<ReturnType<typeof loadPayslip>>;

async function loadPayslip(companyId: string, payrollPeriodId: string, payslipId: string) {
  return getDb().payslip.findFirst({
    where: { id: payslipId, companyId, payrollPeriodId },
    include: {
      payrollPeriod: {
        select: { id: true, name: true, startDate: true, endDate: true, payDate: true },
      },
      employee: {
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
  });
}

function countryNameOf(code: string): string {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/**
 * Assemble the pure view-model input for one payslip: stored columns come
 * from the payslip row, itemized lines recompute from current adjustments
 * (decision #30), so the document always foots — see `stale` in the view.
 */
function toViewInput(
  ctx: CompanyContext,
  payslip: NonNullable<PayslipWithContext>,
  adjustments: Array<{
    type: PayslipViewInput["adjustments"][number]["type"];
    category: PayslipViewInput["adjustments"][number]["category"];
    amount: { toString(): string };
    hours: { toString(): string } | null;
    note: string | null;
  }>,
): PayslipViewInput {
  return {
    company: {
      name: ctx.company.name,
      address: ctx.company.address ?? null,
      taxId: ctx.company.taxId ?? null,
      countryName: countryNameOf(ctx.company.country),
      currency: ctx.company.currency,
    },
    period: {
      name: payslip.payrollPeriod.name,
      startDate: payslip.payrollPeriod.startDate,
      endDate: payslip.payrollPeriod.endDate,
      payDate: payslip.payrollPeriod.payDate,
    },
    payslip: {
      payslipNumber: payslip.payslipNumber,
      status: payslip.status,
      basicSalary: payslip.basicSalary.toString(),
      overtimePay: payslip.overtimePay.toString(),
      grossSalary: payslip.grossSalary.toString(),
      tax: payslip.tax.toString(),
      deductions: payslip.deductions.toString(),
      netSalary: payslip.netSalary.toString(),
    },
    employee: {
      fullName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
      employeeCode: payslip.employee.employeeCode,
      departmentName: payslip.employee.department.name,
      positionName: payslip.employee.position.title,
    },
    settings: { overtimeMultiplier: ctx.company.overtimeMultiplier.toString() },
    adjustments: adjustments.map((row) => ({
      type: row.type,
      category: row.category,
      amount: row.amount.toString(),
      hours: row.hours ? row.hours.toString() : null,
      note: row.note,
    })),
    generatedAt: new Date(),
  };
}

async function adjustmentsByEmployee(
  companyId: string,
  payrollPeriodId: string,
): Promise<Map<string, Awaited<ReturnType<typeof listAdjustments>>>> {
  const rows = await listAdjustments(companyId, payrollPeriodId);
  const map = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = map.get(row.employeeId);
    if (bucket) bucket.push(row);
    else map.set(row.employeeId, [row]);
  }
  return map;
}

async function listAdjustments(companyId: string, payrollPeriodId: string) {
  return getDb().payrollAdjustment.findMany({
    where: { companyId, payrollPeriodId },
    orderBy: { createdAt: "asc" },
    select: { employeeId: true, type: true, category: true, amount: true, hours: true, note: true },
  });
}

/**
 * Single payslip PDF download. Staff-only permission is enforced at the
 * route; the employee portal (Phase 12) reuses this with an employee-scoped
 * guard. Non-final payslips render with a watermark, never blocked.
 */
export async function getPayslipPdfDownload(
  ctx: CompanyContext,
  payrollPeriodId: string,
  payslipId: string,
  meta: RequestMeta = {},
): Promise<PayslipPdfDownload> {
  const payslip = await loadPayslip(ctx.company.id, payrollPeriodId, payslipId);
  if (!payslip) throw new AppError("NOT_FOUND", "Payslip not found in this period.");

  const adjustments = await listAdjustments(ctx.company.id, payrollPeriodId);
  const forEmployee = adjustments.filter((row) => row.employeeId === payslip.employeeId);
  const view = buildPayslipView(toViewInput(ctx, payslip, forEmployee));
  const pdf = await renderPayslipPdf(view);

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payslip.downloaded",
    entityType: "Payslip",
    entityId: payslip.id,
    metadata: {
      payslipNumber: payslip.payslipNumber,
      period: payslip.payrollPeriod.name,
      employee: payslip.employee.employeeCode,
      status: payslip.status,
    },
    ...meta,
  });

  return {
    pdf,
    filename: `payflow-payslip-${slugifyFileStem(payslip.payslipNumber)}.pdf`,
    payslipNumber: payslip.payslipNumber,
  };
}

async function zipBuffers(entries: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", resolve);
    archive.on("error", reject);
    archive.on("warning", reject);
  });
  for (const entry of entries) archive.append(entry.data, { name: entry.name });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

/** Bulk export: one ZIP with every non-VOID payslip PDF of the period. */
export async function getPeriodPayslipZip(
  ctx: CompanyContext,
  payrollPeriodId: string,
  meta: RequestMeta = {},
): Promise<PayslipZipDownload> {
  const db = getDb();
  const period = await db.payrollPeriod.findFirst({
    where: { id: payrollPeriodId, companyId: ctx.company.id },
    select: { id: true, name: true },
  });
  if (!period) throw new AppError("NOT_FOUND", "Payroll period not found.");

  const payslips = await db.payslip.findMany({
    where: { companyId: ctx.company.id, payrollPeriodId, status: { not: "VOID" } },
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
    include: {
      payrollPeriod: {
        select: { id: true, name: true, startDate: true, endDate: true, payDate: true },
      },
      employee: {
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
  });
  if (payslips.length === 0) {
    throw new AppError(
      "BAD_REQUEST",
      "No payslips to export yet — process this payroll period first.",
    );
  }

  const adjustmentMap = await adjustmentsByEmployee(ctx.company.id, payrollPeriodId);
  const entries: Array<{ name: string; data: Buffer }> = [];
  for (const payslip of payslips) {
    const view = buildPayslipView(toViewInput(ctx, payslip, adjustmentMap.get(payslip.employeeId) ?? []));
    const pdf = await renderPayslipPdf(view);
    const name = slugifyFileStem(
      `${payslip.payslipNumber} ${payslip.employee.firstName} ${payslip.employee.lastName}`,
    );
    entries.push({ name: `${name}.pdf`, data: pdf });
  }
  const zip = await zipBuffers(entries);

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payslip.generated",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: { period: period.name, payslips: payslips.length, format: "zip" },
    ...meta,
  });

  return {
    zip,
    filename: `payflow-payslips-${slugifyFileStem(period.name)}.zip`,
    count: payslips.length,
  };
}

/**
 * Payslip-availability fan-out after a period is approved: in-app
 * notification for portal-linked employees + email for everyone with an
 * address on file. Never blocks the approval flow.
 */
export async function notifyPayslipsAvailable(
  companyId: string,
  payrollPeriodId: string,
): Promise<void> {
  try {
    const db = getDb();
    const period = await db.payrollPeriod.findFirst({
      where: { id: payrollPeriodId, companyId },
      select: { name: true, payDate: true },
    });
    if (!period) return;

    const payslips = await db.payslip.findMany({
      where: { companyId, payrollPeriodId, status: "APPROVED" },
      select: {
        employee: { select: { firstName: true, email: true, userId: true } },
      },
    });

    const notifications: Array<{
      companyId: string;
      userId: string;
      title: string;
      body: string;
      link: string;
    }> = [];
    for (const row of payslips) {
      if (row.employee.userId) {
        notifications.push({
          companyId,
          userId: row.employee.userId,
          title: `Your ${period.name} payslip is ready`,
          body: `Your payslip for ${period.name} was approved. Open My payslips in the portal to download it.`,
          link: "/portal/payslips",
        });
      }
      if (row.employee.email) {
        const message = payslipAvailableEmail({
          employeeName: row.employee.firstName,
          periodName: period.name,
          payDateLabel: formatDate(period.payDate),
          url: `${getEnv().APP_URL}/portal/payslips`,
        });
        await sendEmail({ to: row.employee.email, ...message });
      }
    }
    if (notifications.length > 0) await db.notification.createMany({ data: notifications });
  } catch (error) {
    console.warn("[payslips] availability notifications failed", error);
  }
}

import { Prisma, type EmployeeStatus, type EmploymentType, type PaymentMethodType } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import {
  decryptOptional,
  decryptString,
  encryptString,
  maskEncrypted,
} from "@/server/security/crypto";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";
import {
  EMPLOYEE_PAGE_SIZE,
  type EmployeeDirectoryQuery,
  type EmployeeFormInput,
  type PaymentDetailsInput,
} from "@/validations/employee";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ── Employee codes (pure, unit-tested) ──────────────────────────────

/**
 * Codes are `PB-0001`, `PB-0002`, … per company, never reused (a terminated
 * employee's history keeps its code). Generated server-side only; the client
 * never supplies one.
 */
export const EMPLOYEE_CODE_PREFIX = "PB";
const EMPLOYEE_CODE_RE = /^PB-(\d{4,})$/;

export function formatEmployeeCode(sequence: number): string {
  return `${EMPLOYEE_CODE_PREFIX}-${String(sequence).padStart(4, "0")}`;
}

/** Next code given the codes already taken (any order, any format tolerated). */
export function nextEmployeeCode(existingCodes: readonly string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const match = EMPLOYEE_CODE_RE.exec(code);
    if (!match) continue;
    const value = Number.parseInt(match[1] ?? "0", 10);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return formatEmployeeCode(max + 1);
}

// ── Payroll eligibility (pure; decision #4 — payroll phases reuse) ──

export interface PayrollEligibilityRecord {
  status: EmployeeStatus;
  dateHired: Date;
  terminationDate: Date | null;
  basicSalary: Prisma.Decimal | string | number;
}

/**
 * Payable in a period when: hired on/before the period end, salary > 0, and
 * either ACTIVE, or TERMINATED with a termination date inside/after the
 * period start (final-run pay). INACTIVE employees are always excluded.
 */
export function isPayrollEligible(
  employee: PayrollEligibilityRecord,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (Number(employee.basicSalary) <= 0) return false;
  if (employee.dateHired > periodEnd) return false;
  if (employee.status === "ACTIVE") return true;
  if (employee.status === "TERMINATED") {
    return employee.terminationDate !== null && employee.terminationDate >= periodStart;
  }
  return false; // INACTIVE
}

// ── Payment-completeness (pure) ─────────────────────────────────────

export interface StoredPaymentState {
  paymentMethod: PaymentMethodType;
  mobileMoneyProvider: string | null;
  bankNameEnc: string | null;
  bankAccountNumberEnc: string | null;
  mobileMoneyNumberEnc: string | null;
}

/** Does the record hold everything needed to pay the employee by its method? */
export function isPaymentComplete(record: StoredPaymentState): boolean {
  switch (record.paymentMethod) {
    case "BANK":
      return Boolean(record.bankNameEnc && record.bankAccountNumberEnc);
    case "MOBILE_MONEY":
      return Boolean(record.mobileMoneyProvider && record.mobileMoneyNumberEnc);
    case "CASH":
      return true;
  }
}

// ── Directory read model ────────────────────────────────────────────

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  departmentName: string;
  positionTitle: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dateHired: Date;
  /** Whole-XAF string; null when the caller lacks `employees.view_sensitive`. */
  basicSalary: string | null;
  paymentComplete: boolean;
}

export interface EmployeeDirectoryPage {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listEmployees(
  ctx: CompanyContext,
  query: EmployeeDirectoryQuery,
  includeSensitive: boolean,
): Promise<EmployeeDirectoryPage> {
  const db = getDb();
  const where: Prisma.EmployeeWhereInput = {
    companyId: ctx.company.id,
    ...(query.status !== "ALL" ? { status: query.status } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { employeeCode: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const total = await db.employee.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);

  const rows = await db.employee.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    skip: (page - 1) * EMPLOYEE_PAGE_SIZE,
    take: EMPLOYEE_PAGE_SIZE,
    include: {
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      employeeCode: row.employeeCode,
      fullName: `${row.firstName} ${row.lastName}`,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      departmentName: row.department.name,
      positionTitle: row.position.title,
      employmentType: row.employmentType,
      status: row.status,
      dateHired: row.dateHired,
      basicSalary: includeSensitive ? row.basicSalary.toString() : null,
      paymentComplete: isPaymentComplete({
        paymentMethod: row.paymentMethodPreference,
        mobileMoneyProvider: row.mobileMoneyProvider,
        bankNameEnc: row.bankNameEnc,
        bankAccountNumberEnc: row.bankAccountNumberEnc,
        mobileMoneyNumberEnc: row.mobileMoneyNumberEnc,
      }),
    })),
    total,
    page,
    pageSize: EMPLOYEE_PAGE_SIZE,
    totalPages,
  };
}

// ── Profile read model ──────────────────────────────────────────────

export interface EmployeeDetail {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: Date | null;
  nationalId: string | null;
  phone: string | null;
  email: string | null;
  departmentId: string;
  departmentName: string;
  positionId: string;
  positionTitle: string;
  dateHired: Date;
  terminationDate: Date | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  basicSalary: string;
  createdAt: Date;
  updatedAt: Date;
  payment: {
    method: PaymentMethodType;
    complete: boolean;
    bankName: string | null;
    /** Decrypted only when the caller passes includeSensitive; masked otherwise. */
    bankAccountNumber: { masked: string | null; revealed: string | null };
    mobileMoneyProvider: string | null;
    mobileMoneyNumber: { masked: string | null; revealed: string | null };
  };
}

/**
 * Tenant-scoped profile. Payment secrets are returned *masked* by default;
 * plaintext is only decrypted when `includeSensitive` (callers gate this on
 * the `employees.view_sensitive` permission) — never for list views.
 */
export async function getEmployeeDetail(
  companyId: string,
  employeeId: string,
  includeSensitive: boolean,
): Promise<EmployeeDetail | null> {
  const row = await getDb().employee.findFirst({
    where: { id: employeeId, companyId },
    include: {
      department: { select: { id: true, name: true, status: true } },
      position: { select: { id: true, title: true, status: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`,
    dateOfBirth: row.dateOfBirth,
    nationalId: row.nationalId,
    phone: row.phone,
    email: row.email,
    departmentId: row.department.id,
    departmentName: row.department.name,
    positionId: row.position.id,
    positionTitle: row.position.title,
    dateHired: row.dateHired,
    terminationDate: row.terminationDate,
    employmentType: row.employmentType,
    status: row.status,
    basicSalary: row.basicSalary.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    payment: {
      method: row.paymentMethodPreference,
      complete: isPaymentComplete({
        paymentMethod: row.paymentMethodPreference,
        mobileMoneyProvider: row.mobileMoneyProvider,
        bankNameEnc: row.bankNameEnc,
        bankAccountNumberEnc: row.bankAccountNumberEnc,
        mobileMoneyNumberEnc: row.mobileMoneyNumberEnc,
      }),
      bankName: decryptOptional(row.bankNameEnc),
      bankAccountNumber: {
        masked: maskEncrypted(row.bankAccountNumberEnc),
        revealed:
          includeSensitive && row.bankAccountNumberEnc
            ? decryptString(row.bankAccountNumberEnc)
            : null,
      },
      mobileMoneyProvider: row.mobileMoneyProvider,
      mobileMoneyNumber: {
        masked: maskEncrypted(row.mobileMoneyNumberEnc),
        revealed:
          includeSensitive && row.mobileMoneyNumberEnc
            ? decryptString(row.mobileMoneyNumberEnc)
            : null,
      },
    },
  };
}

// ── Shared mutation guards ──────────────────────────────────────────

async function requirePositionInCompany(ctx: CompanyContext, positionId: string) {
  const position = await getDb().position.findFirst({
    where: { id: positionId, companyId: ctx.company.id },
    include: { department: { select: { id: true, status: true } } },
  });
  if (!position) {
    throw new AppError("VALIDATION", "We could not find that position in your workspace.", {
      positionId: ["Choose a valid position"],
    });
  }
  if (position.status !== "ACTIVE" || position.department.status !== "ACTIVE") {
    throw new AppError(
      "BAD_REQUEST",
      "This position (or its department) is archived. Restore it before using it for employees.",
      { positionId: ["This position is archived"] },
    );
  }
  return position;
}

async function requireEmployeeInCompany(ctx: CompanyContext, employeeId: string) {
  const employee = await getDb().employee.findFirst({
    where: { id: employeeId, companyId: ctx.company.id },
  });
  if (!employee) throw new AppError("NOT_FOUND", "Employee not found.");
  return employee;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Parses a `YYYY-MM-DD` form date into a UTC-midnight Date (timezone-safe). */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

// ── Create ──────────────────────────────────────────────────────────

const CODE_RETRY_ATTEMPTS = 5;

/**
 * Creates an employee with an auto-generated code. The department is derived
 * from the chosen position (single source of truth, no mismatches). Code
 * allocation retries on the (companyId, employeeCode) unique index so two
 * concurrent creates can never fail with a raw P2002.
 */
export async function createEmployee(
  ctx: CompanyContext,
  input: EmployeeFormInput,
  meta: RequestMeta = {},
): Promise<{ id: string; employeeCode: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const position = await requirePositionInCompany(ctx, input.positionId);

  for (let attempt = 0; attempt < CODE_RETRY_ATTEMPTS; attempt += 1) {
    const taken = await db.employee.findMany({
      where: { companyId: ctx.company.id, employeeCode: { startsWith: `${EMPLOYEE_CODE_PREFIX}-` } },
      select: { employeeCode: true },
    });
    const employeeCode = nextEmployeeCode(taken.map((row) => row.employeeCode));

    try {
      const employee = await db.employee.create({
        data: {
          companyId: ctx.company.id,
          employeeCode,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : null,
          nationalId: input.nationalId ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          departmentId: position.department.id,
          positionId: position.id,
          dateHired: parseDateOnly(input.dateHired),
          employmentType: input.employmentType,
          basicSalary: new Prisma.Decimal(input.basicSalary),
        },
        select: { id: true, employeeCode: true },
      });

      await audit({
        companyId: ctx.company.id,
        userId: ctx.user.id,
        action: "employee.created",
        entityType: "Employee",
        entityId: employee.id,
        metadata: {
          employeeCode: employee.employeeCode,
          name: `${input.firstName} ${input.lastName}`,
          positionId: position.id,
        },
        ...meta,
      });
      return employee;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < CODE_RETRY_ATTEMPTS - 1) continue;
      throw error;
    }
  }
  throw new AppError("INTERNAL", "Could not allocate an employee code. Please try again.");
}

// ── Update (non-payment fields) ─────────────────────────────────────

export async function updateEmployee(
  ctx: CompanyContext,
  employeeId: string,
  input: EmployeeFormInput,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const existing = await requireEmployeeInCompany(ctx, employeeId);
  const position = await requirePositionInCompany(ctx, input.positionId);

  await db.employee.update({
    where: { id: existing.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : null,
      nationalId: input.nationalId ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      departmentId: position.department.id,
      positionId: position.id,
      dateHired: parseDateOnly(input.dateHired),
      employmentType: input.employmentType,
      basicSalary: new Prisma.Decimal(input.basicSalary),
    },
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "employee.updated",
    entityType: "Employee",
    entityId: existing.id,
    metadata: {
      employeeCode: existing.employeeCode,
      changes: {
        name:
          existing.firstName !== input.firstName || existing.lastName !== input.lastName,
        position: existing.positionId !== position.id,
        dateHired:
          existing.dateHired.getTime() !== parseDateOnly(input.dateHired).getTime(),
        employmentType: existing.employmentType !== input.employmentType,
        salary: existing.basicSalary.toString() !== input.basicSalary,
      },
    },
    ...meta,
  });
}

// ── Payment details (encrypted columns) ─────────────────────────────

/**
 * Replaces payment details. Empty fields keep the stored (encrypted) value;
 * switching methods clears the other method's columns so no stale secret is
 * kept. Plaintext never appears in audit metadata — only last-4 masks.
 */
export async function updatePaymentDetails(
  ctx: CompanyContext,
  employeeId: string,
  input: PaymentDetailsInput,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const existing = await requireEmployeeInCompany(ctx, employeeId);

  const keepBank = input.paymentMethod === "BANK";
  const keepMobile = input.paymentMethod === "MOBILE_MONEY";

  const bankName = keepBank
    ? (input.bankName ?? (existing.bankNameEnc ? decryptString(existing.bankNameEnc) : undefined))
    : undefined;
  const bankAccountNumber = keepBank
    ? (input.bankAccountNumber ??
      (existing.bankAccountNumberEnc ? decryptString(existing.bankAccountNumberEnc) : undefined))
    : undefined;
  const mobileMoneyProvider = keepMobile
    ? (input.mobileMoneyProvider ?? existing.mobileMoneyProvider ?? undefined)
    : undefined;
  const mobileMoneyNumber = keepMobile
    ? (input.mobileMoneyNumber ??
      (existing.mobileMoneyNumberEnc ? decryptString(existing.mobileMoneyNumberEnc) : undefined))
    : undefined;

  // Validate the *resulting* state per method.
  if (input.paymentMethod === "BANK" && (!bankName || !bankAccountNumber)) {
    throw new AppError("VALIDATION", "Bank payments need a bank name and account number.", {
      ...(bankName ? {} : { bankName: ["Enter the bank name"] }),
      ...(bankAccountNumber ? {} : { bankAccountNumber: ["Enter the account number"] }),
    });
  }
  if (input.paymentMethod === "MOBILE_MONEY" && (!mobileMoneyProvider || !mobileMoneyNumber)) {
    throw new AppError(
      "VALIDATION",
      "Mobile money payments need a provider and a wallet number.",
      {
        ...(mobileMoneyProvider
          ? {}
          : { mobileMoneyProvider: ["Choose MTN or Orange Money"] }),
        ...(mobileMoneyNumber ? {} : { mobileMoneyNumber: ["Enter the wallet number"] }),
      },
    );
  }

  await db.employee.update({
    where: { id: existing.id },
    data: {
      paymentMethodPreference: input.paymentMethod,
      bankNameEnc: bankName ? encryptString(bankName) : null,
      bankAccountNumberEnc: bankAccountNumber ? encryptString(bankAccountNumber) : null,
      mobileMoneyProvider: mobileMoneyProvider ?? null,
      mobileMoneyNumberEnc: mobileMoneyNumber ? encryptString(mobileMoneyNumber) : null,
    },
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "employee.payment_updated",
    entityType: "Employee",
    entityId: existing.id,
    metadata: {
      employeeCode: existing.employeeCode,
      method: input.paymentMethod,
      // Masks only — never plaintext, never full ciphertext dumps.
      bankAccountLast4: bankAccountNumber ? bankAccountNumber.replace(/\s+/g, "").slice(-4) : null,
      mobileMoneyLast4: mobileMoneyNumber ? mobileMoneyNumber.replace(/\s+/g, "").slice(-4) : null,
    },
    ...meta,
  });
}

// ── Status lifecycle ────────────────────────────────────────────────

/** ACTIVE ⇄ INACTIVE. TERMINATED is one-way (dedicated terminate action). */
export async function setEmployeeStatus(
  ctx: CompanyContext,
  employeeId: string,
  status: "ACTIVE" | "INACTIVE",
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const existing = await requireEmployeeInCompany(ctx, employeeId);

  if (existing.status === "TERMINATED") {
    throw new AppError(
      "BAD_REQUEST",
      "This employment ended. Terminated records are kept for payroll history and cannot be reactivated — create a new record for a rehire.",
    );
  }
  if (existing.status === status) return; // idempotent

  await db.employee.update({ where: { id: existing.id }, data: { status } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "employee.status_changed",
    entityType: "Employee",
    entityId: existing.id,
    metadata: { employeeCode: existing.employeeCode, from: existing.status, to: status },
    ...meta,
  });
}

/**
 * Ends employment: sets TERMINATED + terminationDate. Guards: not already
 * terminated, date on/after hire date, never future-dated (payroll consumes
 * historical truth; scheduled departures stay ACTIVE until the day).
 */
export async function terminateEmployee(
  ctx: CompanyContext,
  employeeId: string,
  terminationDate: string,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const existing = await requireEmployeeInCompany(ctx, employeeId);

  if (existing.status === "TERMINATED") {
    throw new AppError("CONFLICT", "This employee is already terminated.");
  }

  const date = parseDateOnly(terminationDate);
  const todayUtc = parseDateOnly(new Date().toISOString().slice(0, 10));
  if (date < existing.dateHired) {
    throw new AppError("VALIDATION", "Termination cannot predate the hire date.", {
      terminationDate: ["Pick a date on or after the hire date"],
    });
  }
  if (date > todayUtc) {
    throw new AppError("VALIDATION", "Termination dates cannot be in the future.", {
      terminationDate: ["Future-dated terminations are not supported"],
    });
  }

  await db.employee.update({
    where: { id: existing.id },
    data: { status: "TERMINATED", terminationDate: date },
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "employee.terminated",
    entityType: "Employee",
    entityId: existing.id,
    metadata: { employeeCode: existing.employeeCode, terminationDate },
    ...meta,
  });
}
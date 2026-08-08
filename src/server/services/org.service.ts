import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import type { CompanyContext } from "@/server/tenant/context";
import { dedupeCaseInsensitive } from "@/validations/company";
import type { DepartmentFormInput, PositionFormInput } from "@/validations/org";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ── Pure decisions (unit-tested) ────────────────────────────────────

export type RemovalOutcome = "deleted" | "archived";

/**
 * An org entity referenced by at least one employee (of any status — including
 * terminated, for history) must never be hard-deleted: it is archived instead.
 */
export function decideRemoval(referencedEmployeeCount: number): RemovalOutcome {
  return referencedEmployeeCount > 0 ? "archived" : "deleted";
}

// ── Read models ─────────────────────────────────────────────────────

export interface DepartmentListItem {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  activePositions: number;
  activeEmployees: number;
  /** Employees of ANY status — drives delete-vs-archive. */
  totalEmployees: number;
}

/** All departments with live stats; archived ones sort to the end. */
export async function listDepartmentsWithStats(
  companyId: string,
): Promise<DepartmentListItem[]> {
  const db = getDb();
  const [departments, activePos, activeEmp, totalEmp] = await Promise.all([
    db.department.findMany({
      where: { companyId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    db.position.groupBy({
      by: ["departmentId"],
      where: { companyId, status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.employee.groupBy({
      by: ["departmentId"],
      where: { companyId, status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.employee.groupBy({
      by: ["departmentId"],
      where: { companyId },
      _count: { _all: true },
    }),
  ]);

  const posMap = new Map(activePos.map((r) => [r.departmentId, r._count._all]));
  const empActiveMap = new Map(activeEmp.map((r) => [r.departmentId, r._count._all]));
  const empTotalMap = new Map(totalEmp.map((r) => [r.departmentId, r._count._all]));

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    status: d.status,
    createdAt: d.createdAt,
    activePositions: posMap.get(d.id) ?? 0,
    activeEmployees: empActiveMap.get(d.id) ?? 0,
    totalEmployees: empTotalMap.get(d.id) ?? 0,
  }));
}

export interface PositionListItem {
  id: string;
  title: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  activeEmployees: number;
  totalEmployees: number;
}

export interface DepartmentDetail {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  positions: PositionListItem[];
  activeEmployees: number;
  totalEmployees: number;
}

/** Company-scoped department detail with positions. Null = cross-tenant/absent. */
export async function getDepartmentDetail(
  companyId: string,
  departmentId: string,
): Promise<DepartmentDetail | null> {
  const db = getDb();
  const [department, positions, posActive, posTotal, deptActive, deptTotal] = await Promise.all([
    db.department.findFirst({ where: { id: departmentId, companyId } }),
    db.position.findMany({
      where: { companyId, departmentId },
      orderBy: [{ status: "asc" }, { title: "asc" }],
    }),
    db.employee.groupBy({
      by: ["positionId"],
      where: { companyId, status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.employee.groupBy({
      by: ["positionId"],
      where: { companyId },
      _count: { _all: true },
    }),
    db.employee.count({ where: { companyId, departmentId, status: "ACTIVE" } }),
    db.employee.count({ where: { companyId, departmentId } }),
  ]);
  if (!department) return null;

  const empActiveMap = new Map(posActive.map((r) => [r.positionId, r._count._all]));
  const empTotalMap = new Map(posTotal.map((r) => [r.positionId, r._count._all]));

  return {
    id: department.id,
    name: department.name,
    description: department.description,
    status: department.status,
    createdAt: department.createdAt,
    positions: positions.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      createdAt: p.createdAt,
      activeEmployees: empActiveMap.get(p.id) ?? 0,
      totalEmployees: empTotalMap.get(p.id) ?? 0,
    })),
    activeEmployees: deptActive,
    totalEmployees: deptTotal,
  };
}

// ── Uniqueness guards ───────────────────────────────────────────────
// DB backstop: partial case-insensitive unique indexes (org_ci_uniques
// migration). These app-level checks give friendly 409s first.

async function assertDepartmentNameAvailable(
  companyId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const clash = await getDb().department.findFirst({
    where: {
      companyId,
      status: "ACTIVE",
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { name: true },
  });
  if (clash) {
    throw new AppError("CONFLICT", `A department named “${clash.name}” already exists.`, {
      name: ["This name is already used by another department"],
    });
  }
}

async function assertPositionTitleAvailable(
  companyId: string,
  departmentId: string,
  title: string,
  excludeId?: string,
): Promise<void> {
  const clash = await getDb().position.findFirst({
    where: {
      companyId,
      departmentId,
      status: "ACTIVE",
      title: { equals: title, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { title: true },
  });
  if (clash) {
    throw new AppError("CONFLICT", `A position titled “${clash.title}” already exists here.`, {
      title: ["This title is already used in this department"],
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

// ── Department mutations ────────────────────────────────────────────

export async function createDepartment(
  ctx: CompanyContext,
  input: DepartmentFormInput,
  meta: RequestMeta = {},
): Promise<{ id: string; name: string }> {
  const db = getDb();
  await assertDepartmentNameAvailable(ctx.company.id, input.name);

  let department;
  try {
    department = await db.department.create({
      data: {
        companyId: ctx.company.id,
        name: input.name,
        description: input.description ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CONFLICT", `A department named “${input.name}” already exists.`, {
        name: ["This name is already used by another department"],
      });
    }
    throw error;
  }

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.department_created",
    entityType: "Department",
    entityId: department.id,
    metadata: { name: department.name, source: "organization_page" },
    ...meta,
  });
  return { id: department.id, name: department.name };
}

export async function updateDepartment(
  ctx: CompanyContext,
  departmentId: string,
  input: DepartmentFormInput,
  meta: RequestMeta = {},
): Promise<void> {
  const db = getDb();
  const existing = await db.department.findFirst({
    where: { id: departmentId, companyId: ctx.company.id },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Department not found.");

  await assertDepartmentNameAvailable(ctx.company.id, input.name, departmentId);
  try {
    await db.department.update({
      where: { id: departmentId },
      data: { name: input.name, description: input.description ?? null },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CONFLICT", `A department named “${input.name}” already exists.`, {
        name: ["This name is already used by another department"],
      });
    }
    throw error;
  }

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.department_updated",
    entityType: "Department",
    entityId: departmentId,
    metadata: {
      name: input.name,
      changes: {
        renamed: existing.name !== input.name,
        descriptionChanged: (existing.description ?? null) !== (input.description ?? null),
      },
    },
    ...meta,
  });
}

/**
 * Delete intent → delete when unreferenced, archive when employees reference
 * the department (of any status, so payroll history stays intact).
 */
export async function removeDepartment(
  ctx: CompanyContext,
  departmentId: string,
  meta: RequestMeta = {},
): Promise<RemovalOutcome> {
  const db = getDb();
  const department = await db.department.findFirst({
    where: { id: departmentId, companyId: ctx.company.id },
    include: { _count: { select: { employees: true } } },
  });
  if (!department) throw new AppError("NOT_FOUND", "Department not found.");

  const outcome = decideRemoval(department._count.employees);
  if (outcome === "archived") {
    if (department.status !== "ARCHIVED") {
      await db.department.update({
        where: { id: departmentId },
        data: { status: "ARCHIVED" },
      });
    }
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "org.department_archived",
      entityType: "Department",
      entityId: departmentId,
      metadata: { name: department.name, employees: department._count.employees },
      ...meta,
    });
    return "archived";
  }

  // Unreferenced: remove positions first (FK is ON DELETE RESTRICT), then dept.
  await db.$transaction(async (tx) => {
    await tx.position.deleteMany({ where: { departmentId, companyId: ctx.company.id } });
    await tx.department.delete({ where: { id: departmentId } });
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.department_deleted",
    entityType: "Department",
    entityId: departmentId,
    metadata: { name: department.name },
    ...meta,
  });
  return "deleted";
}

export async function restoreDepartment(
  ctx: CompanyContext,
  departmentId: string,
  meta: RequestMeta = {},
): Promise<void> {
  const db = getDb();
  const department = await db.department.findFirst({
    where: { id: departmentId, companyId: ctx.company.id },
  });
  if (!department) throw new AppError("NOT_FOUND", "Department not found.");
  if (department.status === "ACTIVE") return;

  // Restoring must not clash with an ACTIVE department holding the name.
  await assertDepartmentNameAvailable(ctx.company.id, department.name, departmentId);

  await db.department.update({ where: { id: departmentId }, data: { status: "ACTIVE" } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.department_restored",
    entityType: "Department",
    entityId: departmentId,
    metadata: { name: department.name },
    ...meta,
  });
}

// ── Position mutations ──────────────────────────────────────────────

async function requireDepartmentInCompany(
  ctx: CompanyContext,
  departmentId: string,
): Promise<{ id: string; name: string; status: "ACTIVE" | "ARCHIVED" }> {
  const department = await getDb().department.findFirst({
    where: { id: departmentId, companyId: ctx.company.id },
  });
  if (!department) throw new AppError("NOT_FOUND", "Department not found.");
  return department;
}

export async function createPosition(
  ctx: CompanyContext,
  departmentId: string,
  input: PositionFormInput,
  meta: RequestMeta = {},
): Promise<{ id: string; title: string }> {
  const db = getDb();
  const department = await requireDepartmentInCompany(ctx, departmentId);
  if (department.status === "ARCHIVED") {
    throw new AppError(
      "BAD_REQUEST",
      "Restore this department before adding positions to it.",
    );
  }
  await assertPositionTitleAvailable(ctx.company.id, departmentId, input.title);

  let position;
  try {
    position = await db.position.create({
      data: { companyId: ctx.company.id, departmentId, title: input.title },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CONFLICT", `A position titled “${input.title}” already exists here.`, {
        title: ["This title is already used in this department"],
      });
    }
    throw error;
  }

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.position_created",
    entityType: "Position",
    entityId: position.id,
    metadata: { title: position.title, departmentId },
    ...meta,
  });
  return { id: position.id, title: position.title };
}

export async function updatePosition(
  ctx: CompanyContext,
  positionId: string,
  input: PositionFormInput,
  meta: RequestMeta = {},
): Promise<void> {
  const db = getDb();
  const position = await db.position.findFirst({
    where: { id: positionId, companyId: ctx.company.id },
  });
  if (!position) throw new AppError("NOT_FOUND", "Position not found.");

  await assertPositionTitleAvailable(ctx.company.id, position.departmentId, input.title, positionId);
  try {
    await db.position.update({ where: { id: positionId }, data: { title: input.title } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CONFLICT", `A position titled “${input.title}” already exists here.`, {
        title: ["This title is already used in this department"],
      });
    }
    throw error;
  }

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.position_updated",
    entityType: "Position",
    entityId: positionId,
    metadata: { title: input.title, departmentId: position.departmentId },
    ...meta,
  });
}

export async function removePosition(
  ctx: CompanyContext,
  positionId: string,
  meta: RequestMeta = {},
): Promise<RemovalOutcome> {
  const db = getDb();
  const position = await db.position.findFirst({
    where: { id: positionId, companyId: ctx.company.id },
    include: { _count: { select: { employees: true } } },
  });
  if (!position) throw new AppError("NOT_FOUND", "Position not found.");

  const outcome = decideRemoval(position._count.employees);
  if (outcome === "archived") {
    if (position.status !== "ARCHIVED") {
      await db.position.update({ where: { id: positionId }, data: { status: "ARCHIVED" } });
    }
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "org.position_archived",
      entityType: "Position",
      entityId: positionId,
      metadata: { title: position.title, employees: position._count.employees },
      ...meta,
    });
    return "archived";
  }

  await db.position.delete({ where: { id: positionId } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.position_deleted",
    entityType: "Position",
    entityId: positionId,
    metadata: { title: position.title },
    ...meta,
  });
  return "deleted";
}

export async function restorePosition(
  ctx: CompanyContext,
  positionId: string,
  meta: RequestMeta = {},
): Promise<void> {
  const db = getDb();
  const position = await db.position.findFirst({
    where: { id: positionId, companyId: ctx.company.id },
  });
  if (!position) throw new AppError("NOT_FOUND", "Position not found.");
  if (position.status === "ACTIVE") return;

  await assertPositionTitleAvailable(ctx.company.id, position.departmentId, position.title, positionId);

  await db.position.update({ where: { id: positionId }, data: { status: "ACTIVE" } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "org.position_restored",
    entityType: "Position",
    entityId: positionId,
    metadata: { title: position.title },
    ...meta,
  });
}

/**
 * Bulk-creates the initial departments during onboarding. Names are deduped
 * case-insensitively against each other and against existing departments;
 * ones that already exist are silently skipped. Returns the created names.
 */
export async function createInitialDepartments(
  ctx: CompanyContext,
  names: string[],
  meta: RequestMeta = {},
): Promise<string[]> {
  const db = getDb();
  const wanted = dedupeCaseInsensitive(names.map((n) => n.trim()).filter(Boolean));
  if (wanted.length === 0) return [];

  const existing = await db.department.findMany({
    where: { companyId: ctx.company.id },
    select: { name: true },
  });
  const taken = new Set(existing.map((d) => d.name.toLowerCase()));
  const fresh = wanted.filter((name) => !taken.has(name.toLowerCase()));
  if (fresh.length === 0) return [];

  const created = await db.$transaction(
    fresh.map((name) => db.department.create({ data: { companyId: ctx.company.id, name } })),
  );

  for (const dept of created) {
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "org.department_created",
      entityType: "Department",
      entityId: dept.id,
      metadata: { name: dept.name, source: "setup_wizard" },
      ...meta,
    });
  }
  return created.map((d) => d.name);
}

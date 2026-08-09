import { z } from "zod";
import { REPORT_TYPES, type ReportType } from "@/server/services/report.service";

const dateOnly = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use YYYY-MM-DD`)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), `${label} is not a real date`)
    .optional();

export const reportFilterSchema = z
  .object({
    report: z.enum(REPORT_TYPES as unknown as [ReportType, ...ReportType[]]).default("summary"),
    from: dateOnly("From date"),
    to: dateOnly("To date"),
    departmentId: z.string().optional(),
    employeeId: z.string().optional(),
    periodId: z.string().optional(),
    format: z.enum(["excel", "pdf"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to) {
      const from = Date.parse(`${value.from}T00:00:00Z`);
      const to = Date.parse(`${value.to}T00:00:00Z`);
      if (to < from) {
        ctx.addIssue({ code: "custom", path: ["to"], message: "To date must be on or after From date" });
      }
    }
  });

export type ReportFilterInput = z.infer<typeof reportFilterSchema>;

export function parseFilters(search: Record<string, string | string[] | undefined>): ReportFilterInput {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(search)) {
    if (Array.isArray(v)) flat[k] = v[0];
    else flat[k] = v as string | undefined;
  }
  return reportFilterSchema.parse(flat);
}

export function toReportFilters(input: ReportFilterInput) {
  return {
    from: input.from ? new Date(`${input.from}T00:00:00Z`) : null,
    to: input.to ? new Date(`${input.to}T00:00:00Z`) : null,
    departmentId: input.departmentId || null,
    employeeId: input.employeeId || null,
    periodId: input.periodId || null,
  };
}

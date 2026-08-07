import { z } from "zod";

/** Shared org-entity name rule (departments, positions). */
export const orgNameSchema = z
  .string({ error: "A name is required" })
  .trim()
  .min(2, "Use at least 2 characters")
  .max(80, "Keep it under 80 characters");

const optionalDescription = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(200, "Keep the description under 200 characters").optional(),
);

export const departmentFormSchema = z.object({
  name: orgNameSchema,
  description: optionalDescription,
});
export type DepartmentFormInput = z.infer<typeof departmentFormSchema>;

export const positionFormSchema = z.object({
  title: orgNameSchema,
});
export type PositionFormInput = z.infer<typeof positionFormSchema>;

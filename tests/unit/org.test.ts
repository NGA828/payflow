import { describe, expect, it } from "vitest";
import { decideRemoval } from "@/server/services/org.service";
import { departmentFormSchema, orgNameSchema, positionFormSchema } from "@/validations/org";

describe("decideRemoval", () => {
  it("archives when any employee references the entity", () => {
    expect(decideRemoval(1)).toBe("archived");
    expect(decideRemoval(5)).toBe("archived");
  });

  it("hard-deletes when unreferenced", () => {
    expect(decideRemoval(0)).toBe("deleted");
  });
});

describe("orgNameSchema", () => {
  it("trims and accepts reasonable names", () => {
    expect(orgNameSchema.parse("  Finance & Admin  ")).toBe("Finance & Admin");
  });

  it("rejects short and over-long names", () => {
    expect(orgNameSchema.safeParse("x").success).toBe(false);
    expect(orgNameSchema.safeParse("a".repeat(81)).success).toBe(false);
    expect(orgNameSchema.safeParse("").success).toBe(false);
  });
});

describe("departmentFormSchema", () => {
  it("strips blank descriptions to undefined", () => {
    const parsed = departmentFormSchema.parse({ name: "Operations", description: "   " });
    expect(parsed.description).toBeUndefined();
  });

  it("keeps real descriptions", () => {
    const parsed = departmentFormSchema.parse({ name: "Operations", description: "Field crews" });
    expect(parsed.description).toBe("Field crews");
  });
});

describe("positionFormSchema", () => {
  it("trims titles", () => {
    expect(positionFormSchema.parse({ title: "  Site Engineer " }).title).toBe("Site Engineer");
  });
});

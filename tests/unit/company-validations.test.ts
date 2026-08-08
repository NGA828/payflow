import { describe, expect, it } from "vitest";
import {
  companyInfoSchema,
  dedupeCaseInsensitive,
  orgBasicsSchema,
  payrollSettingsSchema,
} from "@/validations/company";
import { inviteTeamSchema } from "@/validations/team";
import { percentToFraction } from "@/server/services/company.service";
import { clampStep, resolveRequestedStep } from "@/server/services/setup.service";
import { safeRedirectPath } from "@/lib/form-state";

describe("companyInfoSchema", () => {
  it("accepts a minimal payload and strips blank optionals", () => {
    const parsed = companyInfoSchema.parse({ name: "  Prime Builders Ltd ", country: "CM", address: "", taxId: "" });
    expect(parsed.name).toBe("Prime Builders Ltd");
    expect(parsed.address).toBeUndefined();
    expect(parsed.taxId).toBeUndefined();
  });

  it("keeps filled optionals", () => {
    const parsed = companyInfoSchema.parse({
      name: "Prime Builders Ltd",
      country: "CM",
      address: "Bonanjo, Douala",
      taxId: "M021234567890A",
    });
    expect(parsed.address).toBe("Bonanjo, Douala");
  });

  it("rejects an unsupported country and a short name", () => {
    expect(companyInfoSchema.safeParse({ name: "X", country: "CM" }).success).toBe(false);
    expect(companyInfoSchema.safeParse({ name: "Good Name", country: "NG" }).success).toBe(false);
  });
});

describe("payrollSettingsSchema", () => {
  const good = {
    payrollFrequency: "MONTHLY",
    standardHoursPerWeek: "40",
    overtimeMultiplier: "1.2",
    taxRatePercent: "5",
  };

  it("coerces form strings to numbers", () => {
    const parsed = payrollSettingsSchema.parse(good);
    expect(parsed.standardHoursPerWeek).toBe(40);
    expect(parsed.overtimeMultiplier).toBe(1.2);
    expect(parsed.taxRatePercent).toBe(5);
  });

  it("rejects out-of-range values", () => {
    expect(payrollSettingsSchema.safeParse({ ...good, standardHoursPerWeek: "0" }).success).toBe(false);
    expect(payrollSettingsSchema.safeParse({ ...good, standardHoursPerWeek: "61" }).success).toBe(false);
    expect(payrollSettingsSchema.safeParse({ ...good, overtimeMultiplier: "0.9" }).success).toBe(false);
    expect(payrollSettingsSchema.safeParse({ ...good, taxRatePercent: "101" }).success).toBe(false);
    expect(payrollSettingsSchema.safeParse({ ...good, taxRatePercent: "-1" }).success).toBe(false);
  });

  it("rejects more than 2 decimal places", () => {
    expect(
      payrollSettingsSchema.safeParse({ ...good, standardHoursPerWeek: "40.555" }).success,
    ).toBe(false);
  });

  it("accepts decimal fractions within precision", () => {
    expect(
      payrollSettingsSchema.safeParse({ ...good, overtimeMultiplier: "1.25", taxRatePercent: "7.5" }).success,
    ).toBe(true);
  });
});

describe("orgBasicsSchema", () => {
  it("bounds the list size", () => {
    const tooMany = Array.from({ length: 13 }, (_, i) => `Dept ${i}`);
    expect(orgBasicsSchema.safeParse({ departments: tooMany }).success).toBe(false);
    expect(orgBasicsSchema.safeParse({ departments: ["Operations", "Finance"] }).success).toBe(true);
  });

  it("rejects one-character names", () => {
    expect(orgBasicsSchema.safeParse({ departments: ["A"] }).success).toBe(false);
  });
});

describe("dedupeCaseInsensitive", () => {
  it("keeps the first spelling", () => {
    expect(dedupeCaseInsensitive(["Finance", "finance", "FINANCE", "Ops"])).toEqual([
      "Finance",
      "Ops",
    ]);
  });
});

describe("inviteTeamSchema", () => {
  it("rejects invalid emails and caps at five", () => {
    expect(
      inviteTeamSchema.safeParse({ emails: ["nope@"], role: "HR_MANAGER" }).success,
    ).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => `user${i}@x.com`);
    expect(inviteTeamSchema.safeParse({ emails: six, role: "HR_MANAGER" }).success).toBe(false);
  });

  it("accepts staff roles; SUPER_ADMIN and EMPLOYEE stay uninvitable", () => {
    for (const role of ["COMPANY_ADMIN", "HR_MANAGER", "ACCOUNTANT"] as const) {
      expect(inviteTeamSchema.safeParse({ emails: ["a@x.com"], role }).success).toBe(true);
    }
    expect(
      inviteTeamSchema.safeParse({ emails: ["a@x.com"], role: "SUPER_ADMIN" }).success,
    ).toBe(false);
    expect(inviteTeamSchema.safeParse({ emails: ["a@x.com"], role: "EMPLOYEE" }).success).toBe(false);
  });
});

describe("percentToFraction", () => {
  it("converts percents to exact 4dp fractions", () => {
    expect(percentToFraction(0)).toBe("0.0000");
    expect(percentToFraction(5)).toBe("0.0500");
    expect(percentToFraction(5.25)).toBe("0.0525");
    expect(percentToFraction(100)).toBe("1.0000");
    expect(percentToFraction(0.5)).toBe("0.0050");
  });
});

describe("setup step helpers", () => {
  it("clamps arbitrary input into 1..5", () => {
    expect(clampStep("1")).toBe(1);
    expect(clampStep("5")).toBe(5);
    expect(clampStep("0")).toBe(1);
    expect(clampStep("9")).toBe(5);
    expect(clampStep("abc")).toBe(1);
    expect(clampStep("3x")).toBe(3);
    expect(clampStep(2.9)).toBe(2);
  });

  it("redirects to stored progress when nothing is requested", () => {
    expect(resolveRequestedStep(undefined, 3)).toEqual({ step: 3, redirectTo: 3 });
  });

  it("blocks jumping ahead of stored progress", () => {
    expect(resolveRequestedStep("5", 2)).toEqual({ step: 2, redirectTo: 2 });
  });

  it("revisits completed steps without redirect", () => {
    expect(resolveRequestedStep("2", 4)).toEqual({ step: 2, redirectTo: null });
  });

  it("normalizes out-of-range requests", () => {
    expect(resolveRequestedStep("9", 3)).toEqual({ step: 3, redirectTo: 3 });
    expect(resolveRequestedStep("9", 5)).toEqual({ step: 5, redirectTo: 5 });
  });
});

describe("safeRedirectPath", () => {
  it("accepts on-site paths only", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
    expect(safeRedirectPath("//evil.com")).toBeNull();
    expect(safeRedirectPath("https://evil.com")).toBeNull();
    expect(safeRedirectPath("")).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath("dashboard")).toBeNull();
  });
});

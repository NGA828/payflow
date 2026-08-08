/**
 * Unit tests for the employee domain: field encryption, masking, code
 * generation, payroll eligibility, payment completeness, and form schemas.
 * No database involved.
 */
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  // crypto resolves getEnv() lazily on first use; provide a valid minimal env.
  process.env.ENCRYPTION_KEY ??= "ab".repeat(32);
  process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret-32";
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
});

import {
  decryptString,
  encryptString,
  isEncryptedPayload,
  maskEncrypted,
  maskPlaintext,
} from "@/server/security/crypto";
import {
  EMPLOYEE_CODE_PREFIX,
  formatEmployeeCode,
  isPaymentComplete,
  isPayrollEligible,
  nextEmployeeCode,
} from "@/server/services/employee.service";
import { employeeFormSchema, paymentDetailsSchema } from "@/validations/employee";

describe("field encryption (AES-256-GCM)", () => {
  it("round-trips secrets and versions payloads", () => {
    const payload = encryptString("1234567890123456");
    expect(isEncryptedPayload(payload)).toBe(true);
    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("1234567890123456");
    expect(decryptString(payload)).toBe("1234567890123456");
  });

  it("produces unique ciphertexts for identical plaintexts (random IV)", () => {
    expect(encryptString("same")).not.toBe(encryptString("same"));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const [v, iv, tag] = encryptString("secret").split(".");
    const forged = `${v}.${iv}.${tag}.${Buffer.from("forged plaintext").toString("base64")}`;
    expect(() => decryptString(forged)).toThrow();
  });

  it("rejects malformed or foreign payloads", () => {
    expect(() => decryptString("not-a-payload")).toThrow("malformed");
    expect(() => decryptString("v99.a.b.c")).toThrow();
  });

  it("masks via last-4 without leaking plaintext", () => {
    const payload = encryptString("67894521");
    expect(maskEncrypted(payload)).toBe("•••• 4521");
    expect(maskEncrypted(null)).toBeNull();
  });
});

describe("masking", () => {
  it("reveals at most the last 4 characters", () => {
    expect(maskPlaintext("123456789012")).toBe("•••• 9012");
    expect(maskPlaintext("1234 5678")).toBe("•••• 5678");
  });
  it("fully masks very short values", () => {
    expect(maskPlaintext("123")).toBe("••••");
    expect(maskPlaintext("1234")).toBe("••••");
  });
});

describe("employee codes", () => {
  it("starts at PB-0001 with no existing codes", () => {
    expect(EMPLOYEE_CODE_PREFIX).toBe("PB");
    expect(nextEmployeeCode([])).toBe("PB-0001");
  });
  it("takes the numeric max + 1, ignoring foreign formats", () => {
    expect(nextEmployeeCode(["PB-0001", "PB-0003", "INV-99", "PB-2", "random"])).toBe("PB-0004");
  });
  it("grows past 4 digits without truncation", () => {
    expect(nextEmployeeCode(["PB-9999"])).toBe("PB-10000");
    expect(formatEmployeeCode(42)).toBe("PB-0042");
  });
});

describe("payroll eligibility (decision #4)", () => {
  const periodStart = new Date("2026-08-01T00:00:00Z");
  const periodEnd = new Date("2026-08-31T00:00:00Z");
  const base = {
    status: "ACTIVE" as const,
    dateHired: new Date("2026-01-15T00:00:00Z"),
    terminationDate: null,
    basicSalary: "450000",
  };

  it("includes ACTIVE employees hired on/before the period end", () => {
    expect(isPayrollEligible(base, periodStart, periodEnd)).toBe(true);
    expect(
      isPayrollEligible({ ...base, dateHired: new Date("2026-08-31T00:00:00Z") }, periodStart, periodEnd),
    ).toBe(true);
  });
  it("excludes employees hired after the period end", () => {
    expect(
      isPayrollEligible({ ...base, dateHired: new Date("2026-09-01T00:00:00Z") }, periodStart, periodEnd),
    ).toBe(false);
  });
  it("always excludes INACTIVE", () => {
    expect(isPayrollEligible({ ...base, status: "INACTIVE" }, periodStart, periodEnd)).toBe(false);
  });
  it("includes TERMINATED only when the termination falls inside/after the period", () => {
    const terminated = { ...base, status: "TERMINATED" as const };
    expect(
      isPayrollEligible(
        { ...terminated, terminationDate: new Date("2026-08-15T00:00:00Z") },
        periodStart,
        periodEnd,
      ),
    ).toBe(true);
    expect(
      isPayrollEligible(
        { ...terminated, terminationDate: new Date("2026-07-31T00:00:00Z") },
        periodStart,
        periodEnd,
      ),
    ).toBe(false);
    expect(isPayrollEligible({ ...terminated, terminationDate: null }, periodStart, periodEnd)).toBe(
      false,
    );
  });
  it("excludes zero salaries", () => {
    expect(isPayrollEligible({ ...base, basicSalary: "0" }, periodStart, periodEnd)).toBe(false);
    expect(isPayrollEligible({ ...base, basicSalary: 0 }, periodStart, periodEnd)).toBe(false);
  });
});

describe("payment completeness", () => {
  it("validates per payment method", () => {
    expect(
      isPaymentComplete({
        paymentMethod: "BANK",
        mobileMoneyProvider: null,
        bankNameEnc: "x",
        bankAccountNumberEnc: "y",
        mobileMoneyNumberEnc: null,
      }),
    ).toBe(true);
    expect(
      isPaymentComplete({
        paymentMethod: "BANK",
        mobileMoneyProvider: null,
        bankNameEnc: "x",
        bankAccountNumberEnc: null,
        mobileMoneyNumberEnc: null,
      }),
    ).toBe(false);
    expect(
      isPaymentComplete({
        paymentMethod: "MOBILE_MONEY",
        mobileMoneyProvider: "MTN",
        bankNameEnc: null,
        bankAccountNumberEnc: null,
        mobileMoneyNumberEnc: "z",
      }),
    ).toBe(true);
    expect(
      isPaymentComplete({
        paymentMethod: "MOBILE_MONEY",
        mobileMoneyProvider: null,
        bankNameEnc: null,
        bankAccountNumberEnc: null,
        mobileMoneyNumberEnc: "z",
      }),
    ).toBe(false);
    expect(
      isPaymentComplete({
        paymentMethod: "CASH",
        mobileMoneyProvider: null,
        bankNameEnc: null,
        bankAccountNumberEnc: null,
        mobileMoneyNumberEnc: null,
      }),
    ).toBe(true);
  });
});

describe("employee form schema", () => {
  const valid = {
    firstName: "Amina",
    lastName: "Ngo Bell",
    dateHired: "2026-08-01",
    positionId: "pos_1",
    employmentType: "FULL_TIME",
    basicSalary: "450000",
  };

  it("accepts a minimal valid record and normalizes blanks", () => {
    const parsed = employeeFormSchema.parse({ ...valid, email: "", phone: "" });
    expect(parsed.email).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
  });
  it("rejects fractional or negative salaries", () => {
    expect(employeeFormSchema.safeParse({ ...valid, basicSalary: "450000.50" }).success).toBe(false);
    expect(employeeFormSchema.safeParse({ ...valid, basicSalary: "-5" }).success).toBe(false);
    expect(employeeFormSchema.safeParse({ ...valid, basicSalary: "0" }).success).toBe(true);
  });
  it("rejects malformed hire dates", () => {
    expect(employeeFormSchema.safeParse({ ...valid, dateHired: "01/08/2026" }).success).toBe(false);
    expect(employeeFormSchema.safeParse({ ...valid, dateHired: "2026-13-01" }).success).toBe(false);
  });
});

describe("payment details schema", () => {
  it("treats empty strings as keep-current (undefined)", () => {
    const parsed = paymentDetailsSchema.parse({
      paymentMethod: "BANK",
      bankName: "",
      bankAccountNumber: "",
    });
    expect(parsed.bankName).toBeUndefined();
    expect(parsed.bankAccountNumber).toBeUndefined();
  });
  it("rejects invalid account characters", () => {
    expect(
      paymentDetailsSchema.safeParse({ paymentMethod: "BANK", bankAccountNumber: "12*34!" }).success,
    ).toBe(false);
  });
  it("limits mobile providers to the launch-market rails", () => {
    expect(
      paymentDetailsSchema.safeParse({ paymentMethod: "MOBILE_MONEY", mobileMoneyProvider: "VODAFONE" })
        .success,
    ).toBe(false);
  });
});

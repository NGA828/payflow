/**
 * Unit tests for the anomaly detector: every rule fires on its seeded
 * outlier and stays silent on clean employees; severities sort correctly;
 * messages never contain absolute salary figures.
 */
import { describe, expect, it } from "vitest";
import {
  detectAnomalies,
  type AnomalyAdjustmentRef,
  type AnomalyEmployeeInput,
} from "@/server/payroll/anomalies";

function employee(partial: Partial<AnomalyEmployeeInput> = {}): AnomalyEmployeeInput {
  return {
    id: "emp-1",
    fullName: "Amina Ngo Bell",
    employeeCode: "PB-0001",
    netSalary: "859500",
    basicSalary: "850000",
    overtimePay: "0",
    overtimeHours: null,
    previousNetSalary: "811750",
    previousPeriodName: "July 2026",
    paymentComplete: true,
    ...partial,
  };
}

describe("detectAnomalies", () => {
  it("flags nothing for a clean period", () => {
    // +5.9% net move (< 10%), complete payment, no overtime, no adjustments
    expect(detectAnomalies([employee()], [])).toEqual([]);
  });

  it("flags a negative net as critical", () => {
    const [anomaly] = detectAnomalies([employee({ netSalary: "-5000" })], []);
    expect(anomaly?.code).toBe("NEGATIVE_NET");
    expect(anomaly?.severity).toBe("critical");
    expect(anomaly?.employee?.id).toBe("emp-1");
  });

  it("flags missing payment details as a warning", () => {
    const [anomaly] = detectAnomalies([employee({ paymentComplete: false })], []);
    expect(anomaly?.code).toBe("MISSING_PAYMENT");
    expect(anomaly?.severity).toBe("warning");
  });

  it("flags net swings beyond 10% both ways, ignores small moves", () => {
    const down = detectAnomalies(
      [employee({ netSalary: "123250", previousNetSalary: "143250" })],
      [],
    );
    expect(down.map((row) => row.code)).toEqual(["NET_DELTA"]);
    expect(down[0]?.message).toContain("-14.0%");
    expect(down[0]?.message).toContain("July 2026");
    expect(down[0]?.message).not.toMatch(/\d{3} \d{3}|123250|143250/); // no absolute amounts

    const up = detectAnomalies(
      [employee({ netSalary: "935500", previousNetSalary: "811750" })],
      [],
    );
    expect(up[0]?.code).toBe("NET_DELTA");
    expect(up[0]?.message).toContain("+15.2%");

    // exactly at the threshold is NOT flagged (strictly greater)
    const exact = detectAnomalies(
      [employee({ netSalary: "892925", previousNetSalary: "811750" })],
      [],
    );
    expect(exact.filter((row) => row.code === "NET_DELTA")).toEqual([]);
  });

  it("skips the delta check without a previous period or a zero previous net", () => {
    expect(
      detectAnomalies([employee({ previousNetSalary: null, previousPeriodName: null })], []),
    ).toEqual([]);
    expect(detectAnomalies([employee({ previousNetSalary: "0" })], [])).toEqual([]);
  });

  it("flags heavy overtime by hours and by share of basic", () => {
    const byHours = detectAnomalies(
      [
        employee({
          overtimeHours: "25.5",
          overtimePay: "216346",
          netSalary: "1016196", // keeps the delta under 10%… plus flag anyway
          previousNetSalary: "960000",
        }),
      ],
      [],
    );
    expect(byHours.map((row) => row.code)).toContain("HIGH_OVERTIME");
    expect(byHours.find((row) => row.code === "HIGH_OVERTIME")?.message).toContain("25.5");

    const byShare = detectAnomalies(
      [
        employee({
          overtimeHours: "5",
          overtimePay: "200000", // 23.5% of 850000 basic
          netSalary: "900000",
          previousNetSalary: "850000", // +5.9% → no NET_DELTA
        }),
      ],
      [],
    );
    expect(byShare.map((row) => row.code)).toEqual(["HIGH_OVERTIME"]);
  });

  it("flags identical duplicated adjustments with the row count", () => {
    const adjustments: AnomalyAdjustmentRef[] = [
      { employeeId: "emp-1", type: "BONUS", amount: "10000" },
      { employeeId: "emp-1", type: "BONUS", amount: "10000" },
      { employeeId: "emp-1", type: "BONUS", amount: "25000" }, // different amount — fine
      { employeeId: "emp-2", type: "BONUS", amount: "10000" }, // different employee — fine
    ];
    const anomalies = detectAnomalies(
      [employee(), employee({ id: "emp-2", employeeCode: "PB-0002" })],
      adjustments,
    );
    expect(anomalies.map((row) => row.code)).toEqual(["DUPLICATE_ADJUSTMENT"]);
    expect(anomalies[0]?.severity).toBe("warning");
    expect(anomalies[0]?.message).toContain("2 identical BONUS");
    expect(anomalies[0]?.employee?.employeeCode).toBe("PB-0001");
  });

  it("sorts critical before warning before info", () => {
    const anomalies = detectAnomalies(
      [
        employee({
          paymentComplete: false, // warning
          netSalary: "-10", // critical
          overtimeHours: "30", // info
          overtimePay: "300000",
          previousNetSalary: null,
        }),
      ],
      [],
    );
    expect(anomalies.map((row) => row.severity)).toEqual(["critical", "warning", "info"]);
  });
});

/**
 * Unit tests for the payment instruction CSV: RFC 4180 escaping, exact
 * headers/rows, deterministic instruction references, filename slugs.
 */
import { describe, expect, it } from "vitest";
import {
  buildPaymentsCsv,
  csvEscape,
  csvRow,
  paymentInstructionReference,
  paymentsCsvFilename,
  PAYMENT_CSV_HEADERS,
} from "@/server/payroll/payment-csv";

const period = {
  name: "August 2026",
  startDate: new Date("2026-08-01T00:00:00Z"),
  payDate: new Date("2026-09-05T00:00:00Z"),
};

describe("csvEscape", () => {
  it("leaves plain values alone", () => {
    expect(csvEscape("PB-0001")).toBe("PB-0001");
    expect(csvEscape("Amina Ngo Bell")).toBe("Amina Ngo Bell");
    expect(csvEscape("")).toBe("");
  });
  it("quotes values containing commas, quotes or newlines", () => {
    expect(csvEscape("Ngo Bell, Carine")).toBe('"Ngo Bell, Carine"');
    expect(csvEscape('She said "pay me"')).toBe('"She said ""pay me"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("paymentInstructionReference", () => {
  it("is deterministic per period month and employee code", () => {
    expect(paymentInstructionReference(period.startDate, "PB-0001")).toBe("PAY-2026-08-PB-0001");
    expect(paymentInstructionReference(new Date("2026-12-15T00:00:00Z"), "PB-0014")).toBe(
      "PAY-2026-12-PB-0014",
    );
  });
});

describe("paymentsCsvFilename", () => {
  it("slugifies the period name", () => {
    expect(paymentsCsvFilename("August 2026")).toBe("payflow-payments-august-2026.csv");
    expect(paymentsCsvFilename("15 Jun – 15 Sept 2026")).toBe("payflow-payments-15-jun-15-sept-2026.csv");
  });
});

describe("buildPaymentsCsv", () => {
  it("emits the exact header row and CRLF endings", () => {
    const csv = buildPaymentsCsv([], period);
    expect(csv).toBe(`${PAYMENT_CSV_HEADERS.join(",")}\r\n`);
    expect(csv).toBe(
      "reference,employee_code,employee_name,method,bank_or_provider,account_or_msisdn,amount,pay_date,period\r\n",
    );
  });

  it("emits rows sorted by employee code with deterministic references", () => {
    const csv = buildPaymentsCsv(
      [
        {
          employeeCode: "PB-0003",
          fullName: "Dylan Mbappe",
          method: "BANK",
          destination: "",
          account: "",
          amount: "123250",
        },
        {
          employeeCode: "PB-0001",
          fullName: "Amina Ngo Bell",
          method: "BANK",
          destination: "Afriland First Bank",
          account: "1002 3345 6789 4521",
          amount: "811750",
        },
        {
          employeeCode: "PB-0002",
          fullName: "Boris Etoundi",
          method: "MOBILE_MONEY",
          destination: "MTN",
          account: "+237680334455",
          amount: "1146000",
        },
      ],
      period,
    );
    expect(csv).toBe(
      [
        "reference,employee_code,employee_name,method,bank_or_provider,account_or_msisdn,amount,pay_date,period",
        "PAY-2026-08-PB-0001,PB-0001,Amina Ngo Bell,BANK,Afriland First Bank,1002 3345 6789 4521,811750,2026-09-05,August 2026",
        "PAY-2026-08-PB-0002,PB-0002,Boris Etoundi,MOBILE_MONEY,MTN,+237680334455,1146000,2026-09-05,August 2026",
        "PAY-2026-08-PB-0003,PB-0003,Dylan Mbappe,BANK,,,123250,2026-09-05,August 2026",
        "",
      ].join("\r\n"),
    );
  });

  it("escapes names and destinations that need it", () => {
    const csv = buildPaymentsCsv(
      [
        {
          employeeCode: "PB-0004",
          fullName: "Ngo Bell, Carine",
          method: "BANK",
          destination: 'Société "Gen" Bank',
          account: "0011 2233",
          amount: "400000",
        },
      ],
      period,
    );
    expect(csv).toContain(
      'PAY-2026-08-PB-0004,PB-0004,"Ngo Bell, Carine",BANK,"Société ""Gen"" Bank",0011 2233,400000,2026-09-05,August 2026',
    );
  });

  it("csvRow joins escaped cells", () => {
    expect(csvRow(["a", 'b"c', "d,e"])).toBe('a,"b""c","d,e"');
  });
});

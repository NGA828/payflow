import { describe, expect, it } from "vitest";
import { navForRole } from "@/components/layout/nav";

describe("employee portal (P12)", () => {
  it("provides portal nav for EMPLOYEE role", () => {
    const nav = navForRole("EMPLOYEE");
    const labels = nav.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("My payslips");
    expect(labels).toContain("Payment history");
    expect(labels).toContain("My profile");
  });

  it("does not expose company management to EMPLOYEE", () => {
    const nav = navForRole("EMPLOYEE");
    const hrefs = nav.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/employees");
    expect(hrefs).not.toContain("/reports");
    expect(hrefs).not.toContain("/billing");
  });

  it("provides full company nav for COMPANY_ADMIN", () => {
    const nav = navForRole("COMPANY_ADMIN");
    const hrefs = nav.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/billing");
    expect(hrefs).toContain("/audit-log");
  });
});

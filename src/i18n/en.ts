/**
 * English dictionary (default locale). Structure is shared with the future `fr.ts`.
 * Keep UI strings here rather than hardcoding them in components.
 */
export const en = {
  brand: {
    name: "PayFlow",
    tagline: "Payroll built for African businesses",
  },
  landing: {
    nav: { features: "Features", pricing: "Pricing", signIn: "Sign in" },
    hero: {
      badge: "Built for Cameroon · XAF",
      title: "Payroll that runs itself,",
      titleAccent: "month after month",
      subtitle:
        "PayFlow replaces the Excel files, memory and paper trails. Register employees, process monthly payroll, approve, pay, and deliver payslips — all in one secure workspace.",
      ctaPrimary: "Start free trial",
      ctaSecondary: "See how it works",
      note: "14-day free trial · No card required · Cancel anytime",
    },
    features: {
      heading: "Everything payroll, nothing extra",
      sub: "From first hire to payslip in their inbox.",
      items: [
        {
          title: "Accurate payroll engine",
          body: "Decimal-safe calculations for salaries, overtime, bonuses, loans and deductions. No rounding surprises, ever.",
        },
        {
          title: "Roles & approvals",
          body: "Accountants process, admins approve, HR manages people, employees self-serve. Server-enforced permissions.",
        },
        {
          title: "Branded PDF payslips",
          body: "Every employee gets a professional payslip with your logo, itemized earnings and deductions.",
        },
        {
          title: "Payments your way",
          body: "Bank transfer CSVs, mobile money and cash tracking — with full audit trails on every status change.",
        },
        {
          title: "Reports that reconcile",
          body: "Cost by department, trends, overtime and deduction breakdowns. Export to Excel or PDF in one click.",
        },
        {
          title: "Multi-tenant security",
          body: "Row-level tenant isolation, encrypted payment details, and audit logs on every sensitive action.",
        },
      ] as { title: string; body: string }[],
    },
    footer: { copyright: "PayFlow. Payroll, simplified." },
  },
} as const;

export type Dictionary = typeof en;

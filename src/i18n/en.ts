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
    nav: { features: "Features", howItWorks: "How it works", signIn: "Sign in", cta: "Start free" },
    hero: {
      badge: "XAF native · Built for Central Africa",
      titleLine1: "Payroll that runs itself,",
      titleAccent: "month after month.",
      subtitle:
        "PayFlow replaces the spreadsheets, the memory and the paper trails — onboarding, payroll runs, approvals, payments and payslips in one secure workspace.",
      ctaPrimary: "Start free trial",
      ctaSecondary: "See how it works",
      note: "14-day free trial · No card required · Cancel anytime",
      trustedBy: "One workspace — every rail, every report",
    },
    marquee: [
      "MTN Mobile Money",
      "Orange Money",
      "Bank transfer CSV",
      "CNPS declarations",
      "Branded payslips",
      "Excel & PDF exports",
      "Multi-role approvals",
      "Full audit trail",
    ] as string[],
    features: {
      heading: "Everything payroll, nothing extra",
      sub: "From first hire to payslip in their inbox — one engine, zero guesswork.",
      items: [
        {
          title: "An engine that never guesses",
          body: "Decimal-safe math for salaries, overtime, bonuses, loans and statutory deductions. Every line item shows its work — no rounding surprises, ever.",
        },
        {
          title: "Approvals at chat speed",
          body: "Accountants process, admins approve, HR manages people, employees self-serve. Server-enforced permissions keep every role in its lane.",
        },
        {
          title: "Payslips people actually keep",
          body: "Every employee receives a professional, branded PDF with itemized earnings and deductions — delivered the moment the run is paid.",
        },
        {
          title: "Payments your way",
          body: "Bank transfer CSVs, MTN MoMo, Orange Money and cash — with full audit trails on every single status change.",
        },
        {
          title: "Locked down by default",
          body: "Row-level tenant isolation, encrypted payment details, and an audit log on every sensitive action. Security is the floor, not a feature.",
        },
        {
          title: "Reports that reconcile",
          body: "Cost by department, trend lines, overtime and deduction breakdowns — exports that tie out to the franc, in Excel or PDF, in one click.",
        },
      ] as { title: string; body: string }[],
    },
    how: {
      heading: "From spreadsheet to payday in three moves",
      sub: "No implementation project. No consultants. Just payroll.",
      steps: [
        {
          title: "Add your people",
          body: "Import from Excel or invite employees directly. Contracts, salaries, departments and payment details in minutes.",
        },
        {
          title: "Review the run",
          body: "The engine computes earnings, CNPS, IRPP and deductions. Anomaly flags catch the odd ones before money moves.",
        },
        {
          title: "Approve & pay",
          body: "One approval, then bank files, MoMo payouts and branded payslips go out. Everyone is paid, everyone is notified.",
        },
      ] as { title: string; body: string }[],
    },
    stats: [
      { value: 18240, suffix: "+", label: "Payslips delivered" },
      { value: 2.4, prefix: "XAF ", suffix: "B", decimals: 1, label: "Processed annually" },
      { value: 96, suffix: "%", label: "Less time per payroll run" },
      { value: 340, suffix: "+", label: "Teams running PayFlow" },
    ] as { value: number; label: string; suffix?: string; prefix?: string; decimals?: number }[],
    quote: {
      text: "We closed our first payroll in twenty minutes. The payslips alone sold the whole team.",
      author: "A. Mbarga",
      role: "Finance Lead · Logistics group, Douala",
    },
    cta: {
      title: "Run your first payroll",
      titleAccent: "tonight.",
      sub: "Bring one month of data. If PayFlow doesn't beat your spreadsheet, walk away — the trial is free.",
      primary: "Start free trial",
      note: "14-day free trial · No card required · Cancel anytime",
    },
    footer: {
      copyright: "PayFlow. Payroll, simplified.",
      product: "Product",
      actions: "Get started",
      features: "Features",
      howItWorks: "How it works",
      signIn: "Sign in",
      register: "Create account",
    },
  },
} as const;

export type Dictionary = typeof en;

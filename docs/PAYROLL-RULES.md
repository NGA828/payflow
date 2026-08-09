# Payroll Rules

## Periods
- Creation: dates YYYY-MM-DD, start ≤ end ≤ payDate, max 366 days, no overlap day-inclusive (Aug 1–31 and Aug 31–Sep 30 DO overlap). Only one prep period (DRAFT/IN_PROGRESS/READY) at a time; next opens after SUBMITTED. Display name automated: whole-month → “August 2026”, else “15 Jun – 15 Sept 2026” range.
- States: DRAFT → IN_PROGRESS (system, process) → READY (process completes, totals stored) → SUBMITTED (accountant, audit) → APPROVED (admin, materializes payments, notifies) → PAID (all payments SUCCESSFUL, auto-transition) → LOCKED (admin explicit, stamps lockedAt). REJECT returns SUBMITTED → READY with mandatory note. UNLOCK returns APPROVED → READY only if no payment SUCCESSFUL, reason required, audited, deletes non-successful payments.
- Deletion: only DRAFT with zero payslips, removes adjustments in same transaction.

## Eligibility
Employee in scope iff `dateHired ≤ period.endDate` AND (`status=ACTIVE` OR (`TERMINATED` AND `terminationDate ≥ period.startDate`)). INACTIVE always excluded, zero salary excluded (ZERO_SALARY). ONE-WAY termination: TERMINATED cannot reactivate; rehire = new record, code never reused.

## Adjustments
- Types: EARNING (OVERTIME BONUS TRANSPORT MEAL) and DEDUCTION (LOAN ADVANCE PENALTY OTHER_DEDUCTION TAX). Category DERIVED, never client-selectable.
- Amounts: positive whole-XAF integers only, non-zero. OVERTIME carries only hours (amount computed): `hourlyRate = basicSalary / (standardHoursPerWeek × 52/12)`, `overtimePay = hours × hourlyRate × overtimeMultiplier` → half-up XAF via shared helper `overtimePayForHours` used by engine and adjustment service — entry-time and payslip numbers always agree.
- Editability: editable in DRAFT and READY, frozen IN_PROGRESS, locked from SUBMITTED on.
- Validation: OVERTIME requires hours (>0, up to 2dp), amount forbidden; other types require amount, hours forbidden; note optional 0–500 chars normalized.

## Engine (pure, no DB)
- Input: eligible employees, adjustments for period, company settings (standardHoursPerWeek default 40, overtimeMultiplier default 1.2, taxRate fraction 0–1).
- For each eligible employee:
  - basicSalary (Decimal)
  - overtimePay = sum OVERTIME adjustments via `overtimePayForHours` (each rounded half-up individually? Actually overtimePayForHours rounds final; engine sums hours × rate)
  - bonuses = sum BONUS
  - allowances = sum TRANSPORT+MEAL
  - gross = basic+overtime+bonuses+allowances → roundWholeXaf
  - tax = gross × taxRate → roundWholeXaf
  - deductions = tax + sum DEDUCTION types (LOAN+ADVANCE+PENALTY+OTHER+TAX additional) → each leaf rounded half-up first, then summed via integer addition — footing invariant
  - net = gross − deductions → can be negative → anomaly NEGATIVE_NET
- Totals: per period totalEmployees = eligible length, totalGross/Deductions/Net summed from stored payslips (not in-memory fantasy) after upsert.
- Payslip upsert: per (period, employee) unique; existing DRAFT updated in place keeping id/payslipNumber, APPROVED never replaced (sanctity). Sequence PS-YYYY-##### allocated once per run from max existing with prefix.

## Processing
- Inline driver: `processPayroll` runs synchronous in request, writes PayrollRun QUEUED→RUNNING→COMPLETED/FAILED with live processedEmployees progress (same rows BullMQ worker would write). Asserts transition DRAFT/READY → IN_PROGRESS via state-machine module, checks single RUNNING per period (CONFLICT otherwise). On failure, system rollback IN_PROGRESS → DRAFT, run FAILED with errorMessage, audit process_failed.
- Idempotent reprocess: DRAFT→IN_PROGRESS→READY replaces DRAFT payslips; READY→IN_PROGRESS→READY recomputes DRAFT only, skips APPROVED count.

## Review
- Computed on read from stored payslips + adjustments (no snapshots, zero drift). KPIs: employees, gross, deductions, net, previous period net + delta %. Dept cost: net per department sorted desc. Trend: 6 most recent processed periods including current, label “Aug 26”. Anomalies: NEGATIVE_NET critical, MISSING_PAYMENT + DUPLICATE_ADJUSTMENT warning (duplicate identical employee/type/amount), NET_DELTA + HIGH_OVERTIME heads-up (|net| >10% vs previous finalized, >20 OT hours or OT pay >20% basic). Messages never contain absolute salary.

## Payments
- Materialization: approving creates one PENDING payment per payslip (amount=netSalary, method=employee preference). @@unique period+employee makes idempotent. Unlock deletes non-successful payments (none can be SUCCESSFUL by guard).
- Payments page backfills via `ensurePayments` on read (only read-path write, idempotent).
- Instruction CSV: `reference,employee_code,employee_name,method,bank_or_provider,account_or_msisdn,amount,pay_date,period`; only PENDING+FAILED; amounts whole-XAF; RFC4180 quoting + CRLF; deterministic ref `PAY-YYYY-MM-<employeeCode>` for bank idempotency; destinations decrypted server-side at export boundary, export audited (`payment.exported`), permission `payments.export`.
- Status updates: PENDING/FAILED → SUCCESSFUL (optional reference) or FAILED (reason 5–200 chars, retryable). SUCCESSFUL final (no undo). When every payment SUCCESSFUL, period APPROVED→PAID auto (`payroll.marked_paid` audit). PAID→LOCKED explicit by `payroll.approve`, stamps lockedAt.

## Payslips
- Storage: 8 printed lines only; deduction-component breakdown derivable from adjustments (single source). View model recomputed from current adjustments using exact leaf rounding, `stale` flag detects post-run edits → amber footnote.
- PDF: @react-pdf/renderer with embedded Inter woff, U+00A0 grouping for PDFs (fr-FR U+202F not representable in WinAnsi). Dates via Intl en-GB (Sept). Overtime prints ONE line (stored overtimePay, annotation hours×multiplier). Tax line shows effective rate tax÷gross. Labels = free-text note or fallback per type. Watermark DRAFT/VOID for non-final. Rendered on demand, never persisted (pdfUrl null). Bulk ZIP via archiver, deterministic-name, ordered by employee name, audited `payslip.generated`, single `payslip.downloaded`.
- Availability fan-out: `approvePeriod` → `notifyPayslipsAvailable` creates Notification rows for portal-linked employees + email (console in dev) for everyone with email, isolated try/catch.

## Reports (P13)
- Finalized only: APPROVED/PAID/LOCKED. 7 types: summary (period totals), by-dept (dept totals + period×dept matrix), trend (net over time), overtime (OT hours+pay per employee), bonuses, deductions (by type+employee), per-employee (history). KPIs + charts (Recharts gradient area, rounded strokes) + tables. Filters: from/to (start/end), departmentId, employeeId, periodId. Excel via ExcelJS, PDF via @react-pdf/renderer landscape. Audited report.exported, permission REPORTS_EXPORT (Admin/Accountant).

## Subscription & Trial (P14)
- Company starts TRIAL with trialEndsAt = now + plan.trialDays (14 starter). Subscription TRIALING. `computeEffectiveStatus` returns READ_ONLY when TRIAL and trialEndsAt < now. `assertCompanyWritable` blocks mutations in READ_ONLY/SUSPENDED (imported from pure status.ts to avoid pulling auth into unit tests). Billing activation is sole write allowed in READ_ONLY (checks SUSPENDED only). Activation flips company ACTIVE, subscription ACTIVE with 30-day periodEnd, mock (no Stripe). Company layout shows READ_ONLY banner, trial days left. Suspension screen for SUSPENDED.

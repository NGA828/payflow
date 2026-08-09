# Decisions — PayFlow

> Extracted from PLAN.md §6 (44 decisions). This is the canonical log of product & technical choices. Each decision is immutable once implemented; new decisions append.

## 1. Super admin identity
`User.isSuperAdmin` boolean, not a membership. Platform admins have no tenant.

## 2. Money math
`big.js` decimal arithmetic only, DB `Decimal(14,2)` etc., final amounts rounded half-up to whole XAF (zero-decimal). No floats.

## 3. Tax
Single flat `company.taxRate` applied to gross (fraction). Progressive PIT & CNPS out of MVP; engine has `StatutoryRule` hook.

## 4. Termination eligibility
Employee in scope iff `dateHired ≤ period.endDate` AND (`status=ACTIVE` OR (`TERMINATED` AND `terminationDate ≥ period.startDate`)). INACTIVE always excluded.

## 5. Sessions
Auth.js v5 JWT (7-day rolling) + credentials, bcryptjs 12 rounds. Middleware coarse gating; services re-verify membership, role, tenant, effective status.

## 6. One workspace at a time
Schema supports multi-membership; MVP UI auto-selects first ACTIVE membership. Switcher stretch goal.

## 7. Period overlap
Enforced in serializable transaction at service level (Prisma can't express exclusion constraints; optional raw SQL EXCLUDE later).

## 8. Queue fallback
No Redis ⇒ `QUEUE_DRIVER=inline` runs jobs in-process, writing same `PayrollRun` progress rows. BullMQ used when `REDIS_URL` present. Single `JobQueue` interface.

## 9. Unlock rule
`APPROVED → READY` only, by COMPANY_ADMIN, reason required, only while no payment SUCCESSFUL; PAID/LOCKED never unlockable in MVP.

## 10. Payslip numbering
Per-company `PS-YYYY-#####` sequence. Payment ref `PAY-YYYY-MM-{employeeCode}` deterministic instruction ref.

## 11. Reprocess semantics
Re-process in DRAFT/READY replaces DRAFT payslips in-place (upsert by period,employee) in one transaction; APPROVED never touched.

## 12. Reports data scope
Reports use APPROVED/PAID/LOCKED only — finalized money.

## 13. Employee login link
`Employee.userId` may link to EMPLOYEE membership; employee without user has no portal access.

## 14. Currency display
`1 250 000 XAF` space-grouped, no decimals, `XAF` suffix via Intl fr-FR. Dates via Intl Africa/Douala.

## 15. Auth tokens
32-byte random, SHA-256 hashed at rest, single-use, expiring (24h verify, 1h reset, 7d invite).

## 16. Rate limits
Login & password-reset 5 attempts / 15 min per IP+email; memory default, Redis when available.

## 17. Password policy
Min 10 chars with 3-of-4 classes.

## 18. Stack additions
bcryptjs, big.js, archiver, pino, sonner, react-hook-form, date-fns, @tanstack/react-table.

## 19. Verification reality in sandbox
Docker unavailable; native Postgres+Redis in sandbox for verification; docker-compose for local machines.

## 20. Demo data realism
35 employees (34 active +1 terminated), Cameroonian names/phones, MTN/Orange Money + local banks, salaries 85k–950k XAF, 2 historical APPROVED+PAID periods, 1 live DRAFT with adjustments.

## 21. Employee codes
`PB-0001` style, per-company sequence, never reused. Allocated server-side with retry on unique index.

## 22. Sensitive-employment gating
Salary + payment plaintext gated behind `employees.view_sensitive` (Company Admin, Accountant); HR manages records without compensation. Payment secrets AES-256-GCM encrypted at rest (`v1.iv.tag.ct`), masked by default (`•••• 4521`), reveal explicit `?reveal=1`. Audit metadata last-4 only.

## 23. Payment-edit semantics
Empty form fields mean keep stored secret (merged server-side, then completeness validated per method); switching methods clears other method's encrypted columns. CASH wipes everything.

## 24. Termination rules
One-way (TERMINATED can't reactivate; rehire = new record), date ≥ hire date, never future-dated. ACTIVE ⇄ INACTIVE free-form. Departments derived from position.

## 25. Period overlap semantics
Day-inclusive intersection (Aug 1–31 and Aug 31–Sep 30 DO overlap); creation rejects with clashing period name+dates (CONFLICT). Display name automated: “August 2026” for whole-month, else explicit range.

## 26. Single active prep period
One period in DRAFT/IN_PROGRESS/READY at a time; next opens when current SUBMITTED. Only DRAFT with zero payslips deletable.

## 27. Adjustment amounts
Positive whole-XAF integers only; category DERIVED from type. OVERTIME carries only hours: amount computed as hours × (salary ÷ (hoursPerWeek × 52/12)) × multiplier via shared big.js helper.

## 28. Adjustment editability window
Editable in DRAFT and READY (re-processing replaces), frozen IN_PROGRESS, locked from SUBMITTED on.

## 29. Payslip footing invariant
Every leaf line rounded half-up to whole XAF FIRST, then gross/deductions/net composed by integer addition. Stored payslip always reconciles: basic+OT+bonuses+allowances=gross, parts+tax=deductions, gross−deductions=net. Tax base rounded gross.

## 30. Payslip storage = 8 printed lines
Deduction-component breakdown NOT persisted per payslip; recomputed from period's adjustments when detail view/PDF needs it. One source of truth (adjustments).

## 31. Processing driver = inline
`processPayroll` runs synchronously, writing real `PayrollRun` rows (RUNNING→COMPLETED/FAILED with progress) and enforcing state-machine edges. One RUNNING per period.

## 32. Reject = SUBMITTED → READY
Reject with mandatory note 5–500 chars, `payroll.approve` permission. Note lives in `payroll.rejected` audit metadata; payslips stay DRAFT.

## 33. Payslip status lifecycle
DRAFT after processing; approve flips DRAFT → APPROVED; unlock flips APPROVED → DRAFT; VOID reserved for future corrections.

## 34. Review cockpit computed on read
KPIs, dept cost, net trend, anomalies always derive from stored payslips+adjustments (no snapshots). Anomaly messages carry percentages/hours/counts only — never absolute salary (review visible to `payroll.view` incl. HR without sensitive).

## 35. Anomaly rules & thresholds
NEGATIVE_NET (critical), MISSING_PAYMENT + DUPLICATE_ADJUSTMENT (warning), NET_DELTA + HIGH_OVERTIME (heads-up: |net| >10% vs previous finalized, >20 OT hours or OT pay >20% basic). Sorted critical→warning→heads-up.

## 36. Payment materialization
Approving creates one PENDING payment per payslip (`amount=netSalary`, method=employee preference). Unlock DELETES non-successful payments. Payments page backfills idempotent `ensurePayments` on read.

## 37. Payment instruction CSV
Columns `reference,employee_code,employee_name,method,bank_or_provider,account_or_msisdn,amount,pay_date,period`; only PENDING+FAILED; amounts whole-XAF ints; RFC4180 + CRLF; deterministic ref `PAY-YYYY-MM-<code>`; destinations decrypted server-side at export boundary, audited, `payments.export` permission.

## 38. Payment finality & auto-PAID
Pending/failed record SUCCESSFUL (optional ref) or FAILED (reason 5–200 chars, retryable). SUCCESSFUL final (no undo). When every payment succeeds, period APPROVED→PAID automatically (`payroll.marked_paid` audit). PAID→LOCKED explicit by `payroll.approve` stamps `lockedAt`.

## 39. Payslip PDF rendering
`@react-pdf/renderer` with embedded Inter woff 400/500/600/700, resolved absolute at runtime. Money inside PDFs groups with U+00A0 — fr-FR separator U+202F not representable in PDF WinAnsi. Dates reuse app Intl.

## 40. PDF breakdown contract
Printed itemization recomputed from current adjustments using exact leaf rounding (`roundWholeXaf`), so printed lines foot to 8 stored columns; `stale` flag detects post-run edits and prints amber footnote. Overtime prints as ONE line (stored overtimePay, annotation “7.5 h × 1.25”). Tax line shows effective rate derived from document itself (`tax ÷ gross`).

## 41. PDF availability & watermark
Rendered on demand, never persisted (`Payslip.pdfUrl` null): any `payslips.download` role can download any processed payslip; non-final ones render with centered watermark. Employee portal reuses same service behind employee guard (APPROVED only, employee-scoped).

## 42. Bulk ZIP
One deterministic-name PDF per non-VOID payslip, ordered by employee name, streamed via `archiver` into single audited download (`payslip.generated` with count); single downloads audit `payslip.downloaded`. Empty periods refuse BAD_REQUEST.

## 43. Availability fan-out
`approvePeriod` calls `notifyPayslipsAvailable` after materializing payments: in-app `Notification` rows for portal-linked employees + branded email for every payslip'd employee with address on file (console in dev). Isolated in try/catch — notifications never block approval.

## 44. Dev-server PGlite log dump
Next dev sometimes echoes minified `pglite.js` source (multi-MB single line) after first server-action POST, consistent with background unhandled rejection inside WASM FS layer. All requests verified to succeed; data re-verified. Root-cause + suppression is P15 hardening item; `probe-pglite.ts` + bootstrap self-heal cover fatal variant.

## 45. Reports finalize scope (P13 addendum)
7 reports (summary, by-dept, trend, overtime, bonuses, deductions, per-employee) use only finalized periods. Totals use same whole-XAF rounding as payslips. Filters: from/to, department, employee, period. Excel via ExcelJS, PDF via @react-pdf/renderer (landscape). Audited as `report.exported`, permission `reports.export` (Admin/Accountant only).

## 46. Employee portal (P12 addendum)
Portal layout with `EMPLOYEE` role only, nav: Dashboard, My payslips (APPROVED only), Payment history, My profile (masked). Company layout bounces EMPLOYEE to portal gate. Staff routes blocked for EMPLOYEE via `STAFF_ROLES`. Payslip PDF download reuses staff service with employee-scoped guard.

## 47. Subscription & trial (P14 addendum)
`computeEffectiveStatus()` returns READ_ONLY when `status=TRIAL` and `trialEndsAt < now`. `assertCompanyWritable()` blocks mutations in READ_ONLY/SUSPENDED, imported from `status.ts` (pure) to avoid pulling auth into unit tests. Billing activation is the sole write allowed in READ_ONLY (checks SUSPENDED only). Super admin area at `/admin` requires `isSuperAdmin`, separate from company tenancy; company list/detail, suspend/reactivate, plans CRUD, mock billing activation (30-day period, company flips ACTIVE).

## 48. Global payslips/payments aggregation (P15 polishing)
Top-level `/payslips` and `/payments` pages list last 100 items across all periods for quick navigation — prevents dead ends from `REPORTS_VIEW` nav. Empty states, loading, error, forbidden screens are first-class.

## 49. Hardening (P15)
- Test pyramid: 151 unit tests (engine, money, anomalies, RBAC, org, team, payslip-view, portal nav, reports, subscription) + 12 integration suites (85 skipped without DB, 225 passing with DB).
- `next build` green, `tsc --noEmit` green.
- Design system tokens from `payflow-design-system.html` used via Tailwind v4 `@theme` and shadcn primitives.
- Accessibility: focus rings, semantic headings, tab order, keyboard navigation for dialogs, tabular money right-aligned.
- Responsive: bento grids collapse to single column at `lg`, tables scroll horizontally with min-width.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wallet,
} from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getEmployeeDetail } from "@/server/services/employee.service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { EMPLOYMENT_TYPE_LABELS } from "@/features/employees/employee-form";
import { PaymentDetailsForm, ProfileStatusActions } from "../client";

export const metadata: Metadata = { title: "Employee profile" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Employee records are restricted</h1>
          <p className="mt-2 text-[13px] text-body">
            Your role does not include access to employee files.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string | null; icon?: typeof Mail }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{label}</p>
        <p className="mt-0.5 truncate text-[13.5px] text-ink">{value ?? "—"}</p>
      </div>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "payment", label: "Payment" },
] as const;

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const canManage = hasPermission(ctx.membership.role, PERMISSIONS.EMPLOYEES_MANAGE);
  const canSeeSensitive = hasPermission(ctx.membership.role, PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE);

  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "payment" ? "payment" : "overview";
  // Plaintext payment data is only decrypted when BOTH conditions hold — the
  // caller has the sensitive permission AND explicitly asked to reveal.
  const reveal = canSeeSensitive && tab === "payment" && sp.reveal === "1";
  const justCreated = sp.created === "1";

  const employee = await getEmployeeDetail(ctx.company.id, id, reveal);
  if (!employee) notFound();

  const methodIcon =
    employee.payment.method === "BANK"
      ? Landmark
      : employee.payment.method === "MOBILE_MONEY"
        ? Smartphone
        : Wallet;
  const MethodIcon = methodIcon;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/employees"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Back to employees
      </Link>

      {justCreated && (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success-tint px-4 py-3 text-[13px] font-medium text-success">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Employee record created — code {employee.employeeCode} assigned.
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="brand-gradient grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold text-white">
              {`${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-ink">{employee.fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="tnum text-xs text-muted">{employee.employeeCode}</span>
                <Badge variant="outline">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</Badge>
                {employee.status === "ACTIVE" && <Badge variant="green" dot>Active</Badge>}
                {employee.status === "INACTIVE" && <Badge variant="amber" dot>Inactive</Badge>}
                {employee.status === "TERMINATED" && <Badge variant="grey" dot>Terminated</Badge>}
              </div>
            </div>
          </div>
          {canManage && (
            <ProfileStatusActions
              employee={{ id: employee.id, fullName: employee.fullName, status: employee.status }}
            />
          )}
        </div>
        <div className="flex gap-1 border-t border-border px-4">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={`/employees/${employee.id}${item.id === "overview" ? "" : "?tab=payment"}`}
              className={cn(
                "border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors",
                tab === item.id
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-muted hover:text-ink",
              )}
              aria-current={tab === item.id ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Card>

      {tab === "overview" && (
        <>
          {employee.status === "TERMINATED" && employee.terminationDate && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-[13px] text-body">
              <UserRound className="h-4 w-4 shrink-0 text-muted" />
              Employment ended on {formatDate(employee.terminationDate)}. The record is kept for
              payroll history.
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Personal information</h2>
              </div>
              <CardContent className="divide-y divide-slate-100 py-2">
                <Field label="Date of birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : null} icon={CalendarDays} />
                <Field label="National ID" value={employee.nationalId} icon={ShieldCheck} />
                <Field label="Phone" value={employee.phone} icon={Phone} />
                <Field label="Email" value={employee.email} icon={Mail} />
              </CardContent>
            </Card>
            <Card>
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Employment</h2>
              </div>
              <CardContent className="divide-y divide-slate-100 py-2">
                <Field label="Department" value={employee.departmentName} />
                <Field label="Position" value={employee.positionTitle} />
                <Field label="Hired" value={formatDate(employee.dateHired)} icon={CalendarDays} />
                {employee.terminationDate && (
                  <Field label="Termination date" value={formatDate(employee.terminationDate)} icon={CalendarDays} />
                )}
                <div className="flex items-start gap-2.5 py-2">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                  <div>
                    <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                      Monthly basic salary
                    </p>
                    {canSeeSensitive ? (
                      <p className="tnum mt-0.5 text-[13.5px] font-semibold text-teal-700">
                        {formatMoney(employee.basicSalary)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[13px] text-muted">
                        Restricted — visible to Company Admins and Accountants.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {tab === "payment" && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-[13px] font-semibold text-ink">Payment destination</h2>
              {canSeeSensitive && (employee.payment.bankAccountNumber.masked || employee.payment.mobileMoneyNumber.masked) && (
                <Link
                  href={reveal ? `/employees/${employee.id}?tab=payment` : `/employees/${employee.id}?tab=payment&reveal=1`}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary-600 hover:underline"
                >
                  {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {reveal ? "Hide" : "Reveal"}
                </Link>
              )}
            </div>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-primary-600">
                  <MethodIcon className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold text-ink">
                    {employee.payment.method === "BANK"
                      ? "Bank transfer"
                      : employee.payment.method === "MOBILE_MONEY"
                        ? "Mobile money"
                        : "Cash"}
                  </p>
                  {employee.payment.complete ? (
                    <Badge variant="green" dot>Ready for payroll</Badge>
                  ) : (
                    <Badge variant="amber" dot>Incomplete</Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                {employee.payment.method === "BANK" && (
                  <>
                    <Field label="Bank" value={employee.payment.bankName} icon={Landmark} />
                    <Field
                      label="Account number"
                      value={
                        reveal
                          ? (employee.payment.bankAccountNumber.revealed ?? "—")
                          : (employee.payment.bankAccountNumber.masked ?? "—")
                      }
                      icon={CreditCard}
                    />
                  </>
                )}
                {employee.payment.method === "MOBILE_MONEY" && (
                  <>
                    <Field
                      label="Provider"
                      value={
                        employee.payment.mobileMoneyProvider === "MTN"
                          ? "MTN Mobile Money"
                          : employee.payment.mobileMoneyProvider === "ORANGE"
                            ? "Orange Money"
                            : null
                      }
                      icon={Smartphone}
                    />
                    <Field
                      label="Wallet number"
                      value={
                        reveal
                          ? (employee.payment.mobileMoneyNumber.revealed ?? "—")
                          : (employee.payment.mobileMoneyNumber.masked ?? "—")
                      }
                      icon={Phone}
                    />
                  </>
                )}
                {employee.payment.method === "CASH" && (
                  <p className="py-3 text-[13px] text-body">
                    Paid in cash on pay day — no banking details needed.
                  </p>
                )}
              </div>

              {!canSeeSensitive && (
                <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  Account numbers are encrypted at rest and only Company Admins and Accountants
                  can reveal them.
                </p>
              )}
            </CardContent>
          </Card>

          {canManage ? (
            <Card>
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Update payment details</h2>
              </div>
              <CardContent className="pt-4">
                {!employee.payment.complete && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-tint px-3.5 py-2.5 text-[12.5px] text-warning">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    These details are incomplete — the employee cannot be paid until they are
                    filled in.
                  </div>
                )}
                <PaymentDetailsForm
                  employeeId={employee.id}
                  defaultMethod={employee.payment.method}
                  defaultProvider={employee.payment.mobileMoneyProvider}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-6 text-center text-[12.5px] text-muted">
                Only Company Admins and HR Managers can change payment details.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

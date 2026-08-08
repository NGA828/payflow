import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarCheck, PartyPopper, Users } from "lucide-react";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyContext } from "@/server/tenant/context";
import {
  SETUP_STEPS,
  getSetupSnapshot,
  resolveRequestedStep,
} from "@/server/services/setup.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/roles";
import { WizardShell } from "./wizard-shell";
import { CompanyStepForm } from "./company-step-form";
import { PayrollStepForm } from "./payroll-step-form";
import { OrgStepForm } from "./org-step-form";
import { InvitesStepForm } from "./invites-step-form";
import { FinishButton } from "./finish-step";

export const metadata: Metadata = { title: "Setup guide" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Admins run the setup guide</h1>
          <p className="mt-2 text-[13px] text-body">
            Only a Company Admin can configure the workspace. Ask your administrator to complete
            the setup steps.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CompletedScreen({ companyName }: { companyName: string }) {
  return (
    <div className="mx-auto max-w-lg pt-10 text-center">
      <div className="brand-gradient mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl shadow-pop">
        <PartyPopper className="h-7 w-7 text-white" strokeWidth={1.8} />
      </div>
      <h1 className="text-xl font-bold text-ink">{companyName} is ready</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-body">
        Setup is complete. Next milestones: build your org chart, add employees, then run your
        first payroll — all tracked on your dashboard.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-[10px] bg-primary-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          Go to dashboard
        </Link>
        <Link
          href="/setup?step=1"
          className="inline-flex h-10 items-center rounded-[10px] border border-border bg-white px-5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-canvas"
        >
          Review answers
        </Link>
      </div>
    </div>
  );
}

const STEP_COPY: Record<number, { title: string; description: string }> = {
  1: {
    title: "Company information",
    description: "The legal details that appear on payslips and payroll reports.",
  },
  2: {
    title: "Payroll settings",
    description: "How the payroll engine prices hours, overtime and tax.",
  },
  3: {
    title: "Organization basics",
    description: "Seed the departments your employees will belong to.",
  },
  4: {
    title: "Invite your team",
    description: "Give HR and Finance their own logins — payroll is a team sport.",
  },
  5: {
    title: "Review & finish",
    description: "Confirm everything looks right before the workspace goes live.",
  },
};

/** Formats the stored fraction tax rate (0–1) as a clean percent string. */
function taxRateToPercent(taxRate: unknown): string {
  const n = Number(taxRate);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 10_000) / 100);
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyContext();
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  if (!hasPermission(ctx.membership.role, PERMISSIONS.COMPANY_MANAGE_SETTINGS)) {
    return <ForbiddenScreen />;
  }

  const { step: requested } = await searchParams;

  const completed = Boolean(ctx.company.setupCompletedAt);
  if (completed && requested === undefined) {
    return <CompletedScreen companyName={ctx.company.name} />;
  }

  const { step, redirectTo } = resolveRequestedStep(requested, ctx.company.setupStep);
  if (redirectTo !== null) redirect(`/setup?step=${redirectTo}`);

  const copy = STEP_COPY[step] ?? { title: "Setup", description: "" };

  let content: React.ReactNode = null;
  if (step === 1) {
    content = (
      <CompanyStepForm
        defaults={{
          name: ctx.company.name,
          country: ctx.company.country,
          address: ctx.company.address ?? "",
          taxId: ctx.company.taxId ?? "",
        }}
      />
    );
  } else if (step === 2) {
    content = (
      <PayrollStepForm
        defaults={{
          payrollFrequency: ctx.company.payrollFrequency,
          standardHoursPerWeek: String(Number(ctx.company.standardHoursPerWeek)),
          overtimeMultiplier: String(Number(ctx.company.overtimeMultiplier)),
          taxRatePercent: taxRateToPercent(ctx.company.taxRate),
        }}
      />
    );
  } else if (step === 3) {
    const departments = await getDb().department.findMany({
      where: { companyId: ctx.company.id, status: "ACTIVE" },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    content = <OrgStepForm existingDepartments={departments.map((d) => d.name)} />;
  } else if (step === 4) {
    content = <InvitesStepForm />;
  } else {
    const snapshot = await getSetupSnapshot(ctx.company.id);
    content = (
      <div className="flex flex-col gap-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <SummaryCard
            icon={<Building2 className="h-4 w-4" />}
            title="Company"
            editStep={1}
            lines={[
              ctx.company.name,
              ctx.company.address ?? "No address yet",
              ctx.company.taxId ? `Tax ID ${ctx.company.taxId}` : "No tax ID yet",
            ]}
          />
          <SummaryCard
            icon={<CalendarCheck className="h-4 w-4" />}
            title="Payroll"
            editStep={2}
            lines={[
              "Monthly payroll",
              `${Number(ctx.company.standardHoursPerWeek)} h/week · ${Number(ctx.company.overtimeMultiplier)}x overtime`,
              `Flat tax ${taxRateToPercent(ctx.company.taxRate)}% · XAF`,
            ]}
          />
          <SummaryCard
            icon={<Users className="h-4 w-4" />}
            title="Departments"
            editStep={3}
            lines={
              snapshot.departments.length > 0
                ? snapshot.departments.slice(0, 4).map((d) => d.name)
                : ["None yet — add them from the Organization page anytime"]
            }
            trailing={
              snapshot.departments.length > 4 ? (
                <Badge variant="grey">+{snapshot.departments.length - 4} more</Badge>
              ) : undefined
            }
          />
          <SummaryCard
            icon={<Users className="h-4 w-4" />}
            title="Team"
            editStep={4}
            lines={[
              `${snapshot.teamMembers} member${snapshot.teamMembers === 1 ? "" : "s"} (you)`,
              snapshot.pendingInvitations.length > 0
                ? `${snapshot.pendingInvitations.length} invite${snapshot.pendingInvitations.length === 1 ? "" : "s"} pending`
                : "No pending invites",
              ...snapshot.pendingInvitations
                .slice(0, 2)
                .map((i) => `${i.email} · ${roleLabel(i.role)}`),
            ]}
          />
        </dl>
        <FinishButton />
      </div>
    );
  }

  return (
    <WizardShell
      currentStep={step}
      highestReached={completed ? SETUP_STEPS.length : ctx.company.setupStep}
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    </WizardShell>
  );
}

function SummaryCard({
  icon,
  title,
  lines,
  editStep,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
  editStep: number;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-canvas/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
          <span className="text-primary-600">{icon}</span>
          {title}
        </p>
        <Link
          href={`/setup?step=${editStep}`}
          className="text-[12px] font-semibold text-primary-600 hover:text-primary-700"
        >
          Edit
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          {lines.map((line, i) => (
            <p
              key={i}
              className={i === 0 ? "truncate text-[13.5px] font-semibold text-ink" : "truncate text-[12.5px] text-body"}
            >
              {line}
            </p>
          ))}
        </div>
        {trailing}
      </div>
    </div>
  );
}

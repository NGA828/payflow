import { redirect } from "next/navigation";
import { ShieldAlert, MailWarning, LogOut, Building2, Briefcase } from "lucide-react";
import { requireCompanyContext, getSessionUser } from "@/server/tenant/context";
import { AppError } from "@/server/errors";
import { AppShell } from "@/components/layout/app-shell";
import { logoutAction } from "@/features/auth/actions";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

function GateScreen({
  icon,
  title,
  body,
  email,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  email: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 shadow-card">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
          {icon}
        </div>
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-body">{body}</p>
        <p className="mt-3 text-xs text-muted">Signed in as {email}</p>
        <form action={logoutAction} className="mt-5">
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-canvas"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireCompanyContext();
    // Staff-only area: EMPLOYEE role must use the employee portal.
    const STAFF_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "ACCOUNTANT"] as const;
    if (!(STAFF_ROLES as readonly string[]).includes(ctx.membership.role)) {
      // EMPLOYEE attempting to access company routes — bounce to portal gate.
      if (ctx.membership.role === "EMPLOYEE") {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
            <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 shadow-card">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
                <Briefcase className="h-6 w-6 text-primary" strokeWidth={1.8} />
              </div>
              <h1 className="text-lg font-bold text-ink">Employee portal</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-body">
                Your account is an employee account. Company management areas are not accessible with this role. Open the employee portal to view your payslips and payments.
              </p>
              <p className="mt-3 text-xs text-muted">Signed in as {ctx.user.email}</p>
              <div className="mt-5 flex flex-col gap-2">
                <Link href="/portal" className={buttonVariants({ variant: "primary" })}>
                  Go to employee portal
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-canvas">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        );
      }
      throw new AppError("FORBIDDEN", "Staff access required.");
    }
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "FORBIDDEN") {
        // Signed-in user with no active membership (e.g. platform super admin,
        // or a member whose only workspace is disabled).
        const user = await getSessionUser();
        return (
          <GateScreen
            icon={<Building2 className="h-6 w-6 text-primary" strokeWidth={1.8} />}
            title={
              user?.isSuperAdmin ? "Platform admin — no workspace" : "No active workspace"
            }
            body={
              user?.isSuperAdmin
                ? "Super admin accounts manage the PayFlow platform, not a company workspace. Company data is only ever accessible through an active company membership."
                : "Your account is not linked to an active company workspace. If you were invited, accept the invitation from your email. Otherwise contact your administrator."
            }
            email={user?.email ?? ""}
          />
        );
      }
    }
    throw error;
  }

  if (!ctx.user.emailVerifiedAt) {
    return (
      <GateScreen
        icon={<MailWarning className="h-6 w-6 text-warning" strokeWidth={1.8} />}
        title="Verify your email"
        body={`We sent a verification link to ${ctx.user.email}. Confirm it to unlock your workspace. The link is valid for 24 hours.`}
        email={ctx.user.email}
      />
    );
  }

  if (ctx.effectiveStatus === "SUSPENDED") {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-danger" strokeWidth={1.8} />}
        title="Workspace suspended"
        body="This workspace has been suspended by PayFlow. You can no longer access company data. Contact support if you believe this is a mistake."
        email={ctx.user.email}
      />
    );
  }

  const trialDaysLeft =
    ctx.effectiveStatus === "TRIAL" && ctx.company.trialEndsAt
      ? Math.max(
          0,
          Math.ceil((ctx.company.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60_000)),
        )
      : null;

  return (
    <AppShell
      user={{
        fullName: ctx.user.fullName,
        email: ctx.user.email,
        role: ctx.membership.role,
        trialDaysLeft,
      }}
      companyName={ctx.company.name}
    >
      {ctx.effectiveStatus === "READ_ONLY" && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-[#FEF3C7] bg-warning-tint px-4 py-3 text-[13px] text-[#92400E]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Read-only workspace.</strong> Your trial has ended.
            You can view data, but changes are disabled until a plan is activated.
          </span>
        </div>
      )}
      {children}
    </AppShell>
  );
}

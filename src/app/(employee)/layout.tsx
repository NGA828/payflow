import { redirect } from "next/navigation";
import { ShieldAlert, MailWarning, LogOut, Building2, Briefcase } from "lucide-react";
import { getSessionUser } from "@/server/tenant/context";
import { requireEmployeeContext } from "@/server/tenant/employee-context";
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

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireEmployeeContext();
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "FORBIDDEN") {
        const user = await getSessionUser();
        // Platform admin or staff trying to hit /portal — redirect appropriately
        if (user?.isSuperAdmin) {
          return (
            <GateScreen
              icon={<Building2 className="h-6 w-6 text-primary" strokeWidth={1.8} />}
              title="Platform admin — no employee workspace"
              body="Super admin accounts do not have an employee profile. Use the platform administration area or a staff workspace."
              email={user.email ?? ""}
            />
          );
        }
        // Check if it's a staff role — they should be in company area
        try {
          const { requireCompanyContext } = await import("@/server/tenant/context");
          const base = await requireCompanyContext();
          const STAFF_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "ACCOUNTANT"];
          if ((STAFF_ROLES as string[]).includes(base.membership.role)) {
            return (
              <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
                <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 shadow-card">
                  <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
                    <Briefcase className="h-6 w-6 text-primary" strokeWidth={1.8} />
                  </div>
                  <h1 className="text-lg font-bold text-ink">Staff workspace</h1>
                  <p className="mt-2 text-[13px] leading-relaxed text-body">
                    You are signed in as company staff ({base.membership.role}). The employee portal is for employees only. Open your company dashboard instead.
                  </p>
                  <p className="mt-3 text-xs text-muted">Signed in as {base.user.email}</p>
                  <div className="mt-5 flex flex-col gap-2">
                    <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
                      Go to dashboard
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
        } catch {
          // ignore
        }
        return (
          <GateScreen
            icon={<Briefcase className="h-6 w-6 text-primary" strokeWidth={1.8} />}
            title="No employee profile"
            body={error.message}
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
        body={`We sent a verification link to ${ctx.user.email}. Confirm it to unlock your portal.`}
        email={ctx.user.email}
      />
    );
  }

  if (ctx.effectiveStatus === "SUSPENDED") {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-danger" strokeWidth={1.8} />}
        title="Workspace suspended"
        body="This workspace has been suspended by PayFlow. Contact support if you believe this is a mistake."
        email={ctx.user.email}
      />
    );
  }

  return (
    <AppShell
      user={{
        fullName: ctx.user.fullName,
        email: ctx.user.email,
        role: ctx.membership.role,
        trialDaysLeft: null,
      }}
      companyName={ctx.company.name}
    >
      {ctx.effectiveStatus === "READ_ONLY" && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-[#FEF3C7] bg-warning-tint px-4 py-3 text-[13px] text-[#92400E]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Read-only workspace.</strong> Your trial has ended. You can still view your payslips.
          </span>
        </div>
      )}
      {children}
    </AppShell>
  );
}

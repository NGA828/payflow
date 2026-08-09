import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireSuperAdmin, getSessionUser } from "@/server/tenant/context";
import { AppError } from "@/server/errors";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

function GateScreen({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 shadow-card">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
          <ShieldAlert className="h-6 w-6 text-primary" strokeWidth={1.8} />
        </div>
        <h1 className="text-lg font-bold text-ink">Super admin required</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-body">This area is for platform administrators only. Your account does not have super admin privileges.</p>
        <p className="mt-3 text-xs text-muted">Signed in as {email}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>Go to workspace</Link>
        </div>
      </div>
    </div>
  );
}

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect("/login");
    const sessionUser = await getSessionUser();
    return <GateScreen email={sessionUser?.email ?? ""} />;
  }

  if (!user.emailVerifiedAt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <div className="w-full max-w-sm rounded-xl border border-border bg-white p-8 shadow-card">
          <h1 className="text-lg font-bold text-ink">Verify your email</h1>
          <p className="mt-2 text-[13px] text-body">Super admin accounts must verify email before accessing admin area.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 w-[220px] bg-ink px-3 py-4 text-[13px]">
        <Link href="/admin" className="flex items-center gap-2 px-2 py-2 font-bold text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-ink">P</span> PayFlow Admin
        </Link>
        <nav className="mt-6 flex flex-col gap-1">
          <Link href="/admin" className="rounded-lg px-3 py-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white">Dashboard</Link>
          <Link href="/admin/companies" className="rounded-lg px-3 py-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white">Companies</Link>
          <Link href="/admin/plans" className="rounded-lg px-3 py-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white">Plans</Link>
        </nav>
        <div className="absolute bottom-4 left-3 right-3 border-t border-[#1E293B] pt-3">
          <p className="truncate px-2 text-[12px] text-[#64748B]">{user.fullName}</p>
          <p className="truncate px-2 text-[11px] text-[#475569]">{user.email}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pl-[220px]">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-white px-6">
          <p className="text-[13.5px] font-semibold text-ink">Platform Admin</p>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

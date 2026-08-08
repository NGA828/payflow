"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import type { Role } from "@prisma/client";
import { navForRole, roleLabel, roleBadgeVariant } from "@/components/layout/nav";
import { Logo } from "@/components/ui/logo";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

export interface AppShellUser {
  fullName: string;
  email: string;
  role: Role;
  trialDaysLeft: number | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({
  user,
  companyName,
  children,
}: {
  user: AppShellUser;
  companyName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const groups = navForRole(user.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[228px] flex-col bg-ink text-[13px]">
        <div className="px-4 pt-5 pb-3">
          <Link href="/dashboard">
            <Logo dark />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Primary">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2.5 pt-4 pb-1.5 text-[10.5px] font-semibold tracking-[.09em] text-slate-500 uppercase">
                {group.label}
              </p>
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "my-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] font-medium text-[#94A3B8] transition-colors hover:bg-[#1E293B] hover:text-[#E2E8F0]",
                      active &&
                        "bg-[linear-gradient(90deg,rgba(79,70,229,.35),rgba(79,70,229,.12))] text-white shadow-[inset_2px_0_0_#4F46E5]",
                    )}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-[#1E293B] p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="brand-gradient grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white">
              {initials(user.fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#E2E8F0]">{user.fullName}</p>
              <p className="text-[11px] text-[#64748B]">{roleLabel(user.role)}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col pl-[228px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-white px-6">
          <p className="text-[13.5px] font-semibold text-ink">{companyName}</p>
          <Badge variant={roleBadgeVariant(user.role)}>{roleLabel(user.role)}</Badge>
          {user.trialDaysLeft !== null && (
            <Badge variant="amber" dot>
              TRIAL · {user.trialDaysLeft}d left
            </Badge>
          )}
          <div className="ml-auto" ref={menuRef}>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="grid h-[34px] w-[34px] place-items-center rounded-full bg-primary-600 text-[12px] font-semibold text-white transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <span className="sr-only">Account menu</span>
                {initials(user.fullName)}
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-white p-1.5 shadow-pop"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="truncate text-[13px] font-semibold text-ink">{user.fullName}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-body transition-colors hover:bg-slate-100"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        {user.trialDaysLeft !== null && user.trialDaysLeft <= 3 && (
          <div className="flex items-center gap-2.5 border-b border-warning-tint bg-warning-tint px-6 py-2.5 text-[13px] text-[#92400E]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Trial ends in {user.trialDaysLeft} day
              {user.trialDaysLeft === 1 ? "" : "s"}.</strong> Activate a plan to keep payroll running.
            </span>
            <Link href="/billing" className="ml-auto font-semibold underline underline-offset-2">
              View plans
            </Link>
          </div>
        )}

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

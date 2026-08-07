import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { isPasswordResetTokenValid } from "@/server/services/onboarding.service";
import { buttonVariants } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-form";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await isPasswordResetTokenValid(token) : false;

  return (
    <div>
      {valid && token ? (
        <>
          <h1 className="text-center text-lg font-bold text-ink">Set a new password</h1>
          <p className="mt-1 mb-6 text-center text-[13px] text-muted">
            Choose a strong password for your account
          </p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="mb-1 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
            <KeyRound className="h-6 w-6 text-warning" strokeWidth={1.8} />
          </div>
          <h1 className="text-lg font-bold text-ink">This link has expired</h1>
          <p className="text-[13px] leading-relaxed text-body">
            Password reset links are valid for 1 hour and can only be used once. Request a fresh
            one to continue.
          </p>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants({ variant: "secondary" }), "mt-4 w-full")}
          >
            Request a new link
          </Link>
        </div>
      )}
    </div>
  );
}

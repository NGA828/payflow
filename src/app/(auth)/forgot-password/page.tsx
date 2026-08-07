import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-center text-lg font-bold text-ink">Reset your password</h1>
      <p className="mt-1 mb-6 text-center text-[13px] text-muted">
        Enter your email and we&apos;ll send you a reset link
      </p>
      <ForgotPasswordForm />
    </div>
  );
}

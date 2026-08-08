import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(session.user.isSuperAdmin ? "/admin" : "/dashboard");

  return (
    <div>
      <h1 className="text-center text-lg font-bold text-ink">Create your workspace</h1>
      <p className="mt-1 mb-6 text-center text-[13px] text-muted">
        14-day free trial · No card required · Cancel anytime
      </p>
      <RegisterForm />
    </div>
  );
}

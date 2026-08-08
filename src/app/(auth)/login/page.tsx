import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LoginForm } from "./login-form";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string; invited?: string }>;
}) {
  const { reset, next, invited } = await searchParams;

  const session = await auth();
  // Super admins have no company workspace; they land on the dashboard gate
  // screen until the platform admin area ships (/admin).
  if (session?.user) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

  return (
    <div>
      <h1 className="text-center text-lg font-bold text-ink">Welcome back</h1>
      <p className="mt-1 mb-6 text-center text-[13px] text-muted">
        Sign in to your PayFlow workspace
      </p>
      {reset === "success" && (
        <div className="mb-4 flex justify-center">
          <Badge variant="green">Password updated — sign in with your new password</Badge>
        </div>
      )}
      {invited === "1" && (
        <div className="mb-4 flex justify-center">
          <Badge variant="green">Account created — sign in to open your workspace</Badge>
        </div>
      )}
      <LoginForm next={next} />
    </div>
  );
}

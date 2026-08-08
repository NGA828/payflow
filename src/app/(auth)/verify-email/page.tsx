import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MailWarning, MailCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { verifyEmailToken } from "@/server/services/onboarding.service";
import { ResendVerificationForm } from "./resend-form";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Verify your email" };
export const dynamic = "force-dynamic";

interface StateCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}

function StateCard({ icon, title, body, children }: StateCardProps) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <div className="mb-1 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">{icon}</div>
      <h1 className="text-lg font-bold text-ink">{title}</h1>
      <p className="text-[13px] leading-relaxed text-body">{body}</p>
      <div className="mt-4 flex w-full flex-col gap-3">{children}</div>
    </div>
  );
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string; email?: string }>;
}) {
  const { token, sent, email } = await searchParams;

  if (token) {
    const result = await verifyEmailToken(token);
    if (result === "verified" || result === "already_verified") {
      return (
        <StateCard
          icon={<CheckCircle2 className="h-6 w-6 text-success" strokeWidth={1.8} />}
          title={result === "verified" ? "Email verified" : "Already verified"}
          body="Your email address is confirmed. You can sign in and finish setting up your workspace."
        >
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Continue to sign in
          </Link>
        </StateCard>
      );
    }
    return (
      <StateCard
        icon={<MailWarning className="h-6 w-6 text-warning" strokeWidth={1.8} />}
        title="This link has expired"
        body="Verification links are valid for 24 hours. Enter your email below and we'll send a fresh one."
      >
        <ResendVerificationForm defaultEmail={email} />
      </StateCard>
    );
  }

  if (sent === "1") {
    return (
      <StateCard
        icon={<MailCheck className="h-6 w-6 text-primary-600" strokeWidth={1.8} />}
        title="Check your inbox"
        body={`We sent a verification link${email ? ` to ${email}` : " to your email"}. Click it within 24 hours to activate your workspace.`}
      >
        <ResendVerificationForm defaultEmail={email} />
      </StateCard>
    );
  }

  return (
    <StateCard
      icon={<MailCheck className="h-6 w-6 text-primary-600" strokeWidth={1.8} />}
      title="Verify your email"
      body="Need a new verification link? Enter your email and we'll send one."
    >
      <ResendVerificationForm defaultEmail={email} />
    </StateCard>
  );
}

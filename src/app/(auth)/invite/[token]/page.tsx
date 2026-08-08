import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/server/tenant/context";
import { getInvitationView } from "@/server/services/invitation.service";
import { roleLabel } from "@/lib/roles";
import { logoutAction } from "@/features/auth/actions";
import { LogOut } from "lucide-react";
import { AcceptInviteExistingUserForm, AcceptInviteNewUserForm } from "./accept-forms";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getInvitationView(token);

  if (view.status === "invalid") {
    return (
      <div className="text-center">
        <h1 className="text-lg font-bold text-ink">Invitation unavailable</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-body">
          This invitation is invalid, was already used, or has expired. Ask your administrator
          to send a fresh one.
        </p>
        <p className="mt-5 text-[12.5px] text-muted">
          <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  const session = await getSessionUser();
  const signedInAsInvitee = session?.email === view.email;

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-lg font-bold text-ink">Join {view.companyName}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {view.inviterName} invited you as{" "}
          <span className="font-semibold text-ink">{roleLabel(view.role)}</span>
        </p>
        <div className="mt-3 flex justify-center">
          <Badge variant="indigo">{view.email}</Badge>
        </div>
      </div>

      {!view.userExists && !session && (
        <AcceptInviteNewUserForm token={token} email={view.email} />
      )}

      {view.userExists && signedInAsInvitee && <AcceptInviteExistingUserForm token={token} />}

      {session && !signedInAsInvitee && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="rounded-lg bg-warning-tint px-3 py-2.5 text-[13px] text-[#92400E]">
            You are signed in as <strong>{session.email}</strong>, but this invitation was sent
            to <strong>{view.email}</strong>.
          </p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-canvas"
            >
              <LogOut className="h-4 w-4" /> Sign out and switch account
            </button>
          </form>
        </div>
      )}

      {!view.userExists && signedInAsInvitee && (
        // Session email equals the invite email but no account exists yet —
        // edge case after account deletion; let them sign up fresh.
        <AcceptInviteNewUserForm token={token} email={view.email} />
      )}

      {view.userExists && !session && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-body">
            You already have a PayFlow account with this email. Sign in to accept the
            invitation.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-primary-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Sign in to accept
          </Link>
        </div>
      )}
    </div>
  );
}

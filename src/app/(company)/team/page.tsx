import type { Metadata } from "next";
import { Clock, Mail, UserRound } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { listTeam } from "@/server/services/team.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { roleBadgeVariant, roleLabel } from "@/lib/roles";
import { InvitationRowActions, InviteMemberButton, MemberRowActions } from "./client";

export const metadata: Metadata = { title: "Team & invites" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Team management is admin-only</h1>
          <p className="mt-2 text-[13px] text-body">
            Only Company Admins can see the team roster and manage invitations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function TeamPage() {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.TEAM_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const { members, invitations } = await listTeam(ctx.company.id);
  const activeMembers = members.filter((m) => m.status === "ACTIVE");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Team & invites</h1>
          <p className="mt-1 text-[13px] text-muted">
            {activeMembers.length} active member{activeMembers.length === 1 ? "" : "s"}
            {invitations.length > 0 &&
              ` · ${invitations.length} open invitation${invitations.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <InviteMemberButton />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Members ({members.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Member</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Joined</th>
                <th className="py-2.5 pr-5 pl-4 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.userId === ctx.user.id;
                const disabled = member.status === "DISABLED";
                return (
                  <tr
                    key={member.id}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60"
                  >
                    <td className="py-3 pr-4 pl-5">
                      <div className="flex items-center gap-2.5">
                        <span className="brand-gradient grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white">
                          {member.user.fullName
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase() ?? "")
                            .join("")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-ink">
                            {member.user.fullName}
                            {isSelf && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-muted">{member.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleBadgeVariant(member.role)}>{roleLabel(member.role)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {disabled ? (
                        <Badge variant="grey" dot>
                          Disabled
                        </Badge>
                      ) : (
                        <Badge variant="green" dot>
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-muted">
                      {member.joinedAt ? formatDate(member.joinedAt) : "—"}
                    </td>
                    <td className="py-3 pr-4 pl-4 text-right">
                      <MemberRowActions
                        member={{
                          membershipId: member.id,
                          name: member.user.fullName,
                          email: member.user.email,
                          role: member.role,
                          status: member.status,
                          isSelf,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">
            Open invitations ({invitations.length})
          </h2>
        </div>
        {invitations.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50">
              <Mail className="h-5 w-5 text-primary-600" strokeWidth={1.7} />
            </span>
            <p className="text-[13.5px] font-semibold text-ink">No open invitations</p>
            <p className="mt-1 max-w-xs text-[12.5px] text-body">
              Invite HR or Finance to share the workload — links expire after 7 days.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Invited by</th>
                  <th className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Expires
                    </span>
                  </th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="py-2.5 pr-5 pl-4 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr
                    key={invitation.id}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60"
                  >
                    <td className="py-3 pr-4 pl-5">
                      <span className="text-[13.5px] font-medium text-ink">{invitation.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleBadgeVariant(invitation.role)}>
                        {roleLabel(invitation.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-body">
                        <UserRound className="h-3.5 w-3.5 text-muted" />
                        {invitation.invitedByName}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-muted">
                      {formatDate(invitation.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      {invitation.status === "PENDING" ? (
                        <Badge variant="blue" dot>
                          Pending
                        </Badge>
                      ) : (
                        <Badge variant="amber" dot>
                          Expired
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4 pl-4 text-right">
                      <InvitationRowActions
                        invitation={{
                          id: invitation.id,
                          email: invitation.email,
                          status: invitation.status,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

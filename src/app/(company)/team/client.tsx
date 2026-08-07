"use client";

import { useActionState, useEffect, useState } from "react";
import { Ban, MailPlus, Send, ShieldCheck, UserRoundCheck, XCircle } from "lucide-react";
import type { Role } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowMenu } from "@/components/ui/row-menu";
import { FormField } from "@/components/ui/form-field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IDLE_FORM_STATE } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { useDirectAction } from "@/lib/use-direct-action";
import { INVITABLE_ROLES } from "@/validations/team";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  setMembershipStatusAction,
} from "@/features/team/actions";

const ROLE_HELP: Record<(typeof INVITABLE_ROLES)[number], string> = {
  COMPANY_ADMIN: "Full control — team, settings, billing, approvals",
  HR_MANAGER: "Runs the org and employee records",
  ACCOUNTANT: "Processes payroll, expenses and payments",
};

/** 3-card role picker shared by the invite and change-role dialogs. */
function RoleCards({
  value,
  onChange,
  disabledRole,
}: {
  value: (typeof INVITABLE_ROLES)[number];
  onChange: (role: (typeof INVITABLE_ROLES)[number]) => void;
  disabledRole?: Role;
}) {
  return (
    <div className="grid gap-2">
      {INVITABLE_ROLES.map((role) => {
        const disabled = role === disabledRole;
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => onChange(role)}
            aria-pressed={value === role}
            className={cn(
              "rounded-lg border px-3.5 py-3 text-left transition-all",
              value === role
                ? "border-primary-600 bg-indigo-50/60 ring-2 ring-indigo-100"
                : "border-border bg-white hover:border-slate-300",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="mb-1 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">{ROLE_LABELS[role]}</span>
              {value === role && <Badge variant="indigo">Selected</Badge>}
            </span>
            <span className="text-[12px] text-muted">{ROLE_HELP[role]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Invite ──────────────────────────────────────────────────────────

export function InviteMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction] = useActionState(inviteMemberAction, IDLE_FORM_STATE);
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>("HR_MANAGER");
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) onClose();
  }, [succeeded, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite a teammate"
      description="They'll get an email with a link that expires in 7 days."
    >
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <FormError message={state.message} />
        <FormField label="Work email" htmlFor="invite-email" required error={state.fieldErrors?.email?.[0]}>
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="teammate@company.com"
            error={Boolean(state.fieldErrors?.email)}
            required
          />
        </FormField>
        <FormField label="They will join as" htmlFor="invite-role" required error={state.fieldErrors?.role?.[0]}>
          <input type="hidden" name="role" value={role} />
          <RoleCards value={role} onChange={setRole} />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton>
            <Send className="h-4 w-4" /> Send invitation
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

export function InviteMemberButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <MailPlus className="h-4 w-4" /> Invite member
      </Button>
      <InviteMemberDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ── Change role ─────────────────────────────────────────────────────

function ChangeRoleDialog({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: { membershipId: string; name: string; role: Role };
}) {
  const [state, formAction] = useActionState(changeMemberRoleAction, IDLE_FORM_STATE);
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number] | null>(null);
  const succeeded = useSuccessToast(state);
  useEffect(() => {
    if (succeeded) {
      onClose();
      setRole(null);
    }
  }, [succeeded, onClose]);

  const current = (INVITABLE_ROLES as readonly string[]).includes(member.role)
    ? (member.role as (typeof INVITABLE_ROLES)[number])
    : "HR_MANAGER";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change ${member.name}'s role`}
      description="Permissions update immediately — the sidebar and payroll flows follow the new role."
    >
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="membershipId" value={member.membershipId} />
        <input type="hidden" name="role" value={role ?? current} />
        <FormError message={state.message} />
        <RoleCards value={role ?? current} onChange={setRole} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton disabled={role === null || role === current}>Save role</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

// ── Member row actions ──────────────────────────────────────────────

export interface MemberActionProps {
  membershipId: string;
  name: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  isSelf: boolean;
}

export function MemberRowActions({ member }: { member: MemberActionProps }) {
  const [changingRole, setChangingRole] = useState(false);
  const [toggling, setToggling] = useState(false);

  const disabled = member.status === "DISABLED";

  return (
    <>
      <RowMenu
        label={`Actions for ${member.name}`}
        items={
          member.isSelf
            ? [
                {
                  label: "That's you — another admin manages your access",
                  icon: ShieldCheck,
                  disabled: true,
                  onSelect: () => {},
                },
              ]
            : [
                {
                  label: "Change role…",
                  icon: UserRoundCheck,
                  disabled,
                  onSelect: () => setChangingRole(true),
                },
                disabled
                  ? {
                      label: "Re-enable access",
                      icon: UserRoundCheck,
                      onSelect: () => setToggling(true),
                    }
                  : {
                      label: "Disable access",
                      icon: Ban,
                      destructive: true,
                      onSelect: () => setToggling(true),
                    },
              ]
        }
      />

      <ChangeRoleDialog
        open={changingRole}
        onClose={() => setChangingRole(false)}
        member={{ membershipId: member.membershipId, name: member.name, role: member.role }}
      />

      <ConfirmDialog
        open={toggling}
        onClose={() => setToggling(false)}
        icon={disabled ? UserRoundCheck : Ban}
        iconTint={disabled ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}
        title={disabled ? `Re-enable ${member.name}?` : `Disable ${member.name}?`}
        body={
          disabled
            ? `${member.email} regains access to this workspace with their previous role.`
            : `${member.email} loses access to this workspace immediately. Their history (audit trail, payroll records) is untouched, and you can re-enable them anytime.`
        }
        confirmLabel={disabled ? "Re-enable access" : "Disable access"}
        destructive={!disabled}
        action={setMembershipStatusAction}
        fields={{ membershipId: member.membershipId, intent: disabled ? "enable" : "disable" }}
      />
    </>
  );
}

// ── Invitation row actions ──────────────────────────────────────────

export function InvitationRowActions({
  invitation,
}: {
  invitation: { id: string; email: string; status: "PENDING" | "EXPIRED" };
}) {
  const [revoking, setRevoking] = useState(false);
  const resend = useDirectAction(resendInvitationAction, { invitationId: invitation.id });

  return (
    <>
      <RowMenu
        label={`Actions for ${invitation.email}`}
        items={[
          {
            label: resend.pending ? "Resending…" : invitation.status === "EXPIRED" ? "Send fresh link" : "Resend invitation",
            icon: Send,
            disabled: resend.pending,
            onSelect: resend.run,
          },
          { label: "Revoke", icon: XCircle, destructive: true, onSelect: () => setRevoking(true) },
        ]}
      />

      <ConfirmDialog
        open={revoking}
        onClose={() => setRevoking(false)}
        icon={XCircle}
        iconTint="bg-danger-tint text-danger"
        title={`Revoke invitation to ${invitation.email}?`}
        body="Their link stops working immediately. You can always send a fresh invitation later."
        confirmLabel="Revoke invitation"
        destructive
        action={revokeInvitationAction}
        fields={{ invitationId: invitation.id }}
      />
    </>
  );
}

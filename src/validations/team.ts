import { z } from "zod";
import { emailSchema } from "@/validations/auth";
import { passwordSchema } from "@/server/auth/password";

/**
 * Staff roles grantable through a team invitation or a role change.
 * SUPER_ADMIN is platform-only (never invitable); EMPLOYEE accounts are
 * created from employee records in a later phase, not from /team.
 */
export const INVITABLE_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "ACCOUNTANT"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const inviteTeamSchema = z.object({
  emails: z.array(emailSchema, { error: "Invalid email list" }).max(5, "Invite at most 5 people at once"),
  role: z.enum(INVITABLE_ROLES, { error: "Choose a role for these invitations" }),
});
export type InviteTeamInput = z.infer<typeof inviteTeamSchema>;

/** Single invite from the /team dialog. */
export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITABLE_ROLES, { error: "Choose a role" }),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/** Role reassignment for an existing staff member. */
export const changeRoleSchema = z.object({
  role: z.enum(INVITABLE_ROLES, { error: "Choose a valid role" }),
});

/** New account created straight from an invitation link. */
export const acceptInviteNewUserSchema = z.object({
  token: z.string().min(10),
  fullName: z
    .string({ error: "Your name is required" })
    .trim()
    .min(2, "Enter your full name")
    .max(120),
  password: passwordSchema,
});

/** Existing signed-in user accepting an invitation. */
export const acceptInviteExistingUserSchema = z.object({
  token: z.string().min(10),
});

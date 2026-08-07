import { z } from "zod";
import { emailSchema } from "@/validations/auth";
import { passwordSchema } from "@/server/auth/password";

/** Roles that can be granted through a team invitation. */
export const INVITABLE_ROLES = ["HR_MANAGER", "ACCOUNTANT"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const inviteTeamSchema = z.object({
  emails: z.array(emailSchema, { error: "Invalid email list" }).max(5, "Invite at most 5 people at once"),
  role: z.enum(INVITABLE_ROLES, { error: "Choose a role for these invitations" }),
});
export type InviteTeamInput = z.infer<typeof inviteTeamSchema>;

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

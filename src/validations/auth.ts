import { z } from "zod";
import { passwordSchema } from "@/server/auth/password";

export const emailSchema = z
  .email({ error: "Enter a valid email address" })
  .transform((v) => v.toLowerCase().trim());

export const registerCompanySchema = z.object({
  fullName: z
    .string({ error: "Your name is required" })
    .trim()
    .min(2, "Enter your full name")
    .max(120),
  email: emailSchema,
  companyName: z
    .string({ error: "Company name is required" })
    .trim()
    .min(2, "Enter your company name")
    .max(120),
  password: passwordSchema,
});
export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Password is required" }).min(1, "Enter your password"),
  /** Optional post-login path; sanitized server-side (on-site paths only). */
  next: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_ROUNDS = 12;

/**
 * Password policy: min 10 characters with at least 3 of 4 character classes
 * (lowercase, uppercase, digit, symbol).
 */
export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(10, "Use at least 10 characters")
  .max(128, "Password is too long")
  .superRefine((value, ctx) => {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) =>
      re.test(value),
    ).length;
    if (classes < 3) {
      ctx.addIssue({
        code: "custom",
        message: "Use a mix of upper/lowercase letters, numbers and symbols",
      });
    }
  });

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

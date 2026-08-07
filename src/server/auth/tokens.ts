import crypto from "node:crypto";
import type { AuthTokenType } from "@prisma/client";

/**
 * Single-use tokens (email verification, password reset, team invitations).
 * The raw token goes in the email link; only its SHA-256 hash is stored.
 */

export const TOKEN_TTLS = {
  EMAIL_VERIFICATION_MS: 24 * 60 * 60_000, // 24 h
  PASSWORD_RESET_MS: 60 * 60_000, // 1 h
  INVITATION_MS: 7 * 24 * 60 * 60_000, // 7 d
} as const;

export interface GeneratedToken {
  raw: string; // base64url, goes into the link
  hash: string; // stored
}

export function generateToken(): GeneratedToken {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface StoredTokenLike {
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt?: Date | null;
}

export function matchToken(token: StoredTokenLike, raw: string): boolean {
  if (token.tokenHash !== hashToken(raw)) return false;
  if (token.consumedAt) return false;
  if (token.revokedAt) return false;
  if (token.expiresAt.getTime() < Date.now()) return false;
  return true;
}

export interface TokenRepository {
  create(data: {
    userId: string;
    type: AuthTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findByHash(tokenHash: string): Promise<{
    id: string;
    userId: string;
    type: AuthTokenType;
    tokenHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null>;
  consume(id: string): Promise<void>;
}

/** Pure issuance logic, dependency-injected for testing. */
export async function issueToken(
  repo: TokenRepository,
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<GeneratedToken> {
  const token = generateToken();
  await repo.create({
    userId,
    type,
    tokenHash: token.hash,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

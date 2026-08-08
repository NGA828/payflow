import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * AES-256-GCM field encryption for sensitive columns (bank account numbers,
 * mobile money numbers). Payloads carry their own IV and auth tag:
 *
 *   v1.<base64 iv>.<base64 tag>.<base64 ciphertext>
 *
 * A fresh random 12-byte IV per write means identical plaintexts never produce
 * identical ciphertexts (no equality lookups on these columns are possible or
 * needed). The 64-hex-char ENCRYPTION_KEY gives one 32-byte key; rotation is
 * handled by prefixing a version (`v1`), so a future `v2` can re-encrypt lazily.
 */

const VERSION = "v1";
const IV_BYTES = 12;

/** Lazily resolved so importing this module never crashes build-time analysis. */
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) cachedKey = Buffer.from(getEnv().ENCRYPTION_KEY, "hex");
  return cachedKey;
}

/** True for values written by {@link encryptString} (any version). */
export function isEncryptedPayload(value: string | null | undefined): boolean {
  return typeof value === "string" && /^v\d+\./.test(value);
}

export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/**
 * Decrypts a payload produced by {@link encryptString}. Throws on tampered,
 * malformed, or unsupported-version input — callers must never swallow this
 * and fall back to plaintext (a silent fallback would mask corruption).
 */
export function decryptString(payload: string): string {
  const [version, ivB64, tagB64, ciphertextB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Unsupported or malformed encrypted payload");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Server-side convenience: decrypt an encrypted column into a display mask.
 * Returns null when there is nothing stored. Plaintext never crosses into
 * list/detail responses — only this mask (and only to roles allowed to see
 * even that).
 */
export function maskEncrypted(payload: string | null): string | null {
  if (!payload) return null;
  return maskPlaintext(decryptString(payload));
}

/**
 * `•••• 4521` — reveals at most the last 4 characters of a secret. Values of
 * 4 characters or fewer are fully masked so even length hints stay minimal.
 */
export function maskPlaintext(plaintext: string): string {
  const normalized = plaintext.replace(/\s+/g, "").trim();
  if (normalized.length <= 4) return "••••";
  return `•••• ${normalized.slice(-4)}`;
}

/** Encrypts a nullable form value; null/empty stays null (column cleared). */
export function encryptOptional(plaintext: string | null | undefined): string | null {
  const value = plaintext?.trim();
  return value ? encryptString(value) : null;
}

/** Decrypts a nullable column; null stays null. */
export function decryptOptional(payload: string | null): string | null {
  return payload ? decryptString(payload) : null;
}

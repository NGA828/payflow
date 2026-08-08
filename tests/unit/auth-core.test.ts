import { describe, expect, it } from "vitest";
import { generateToken, hashToken, issueToken, matchToken } from "@/server/auth/tokens";
import { passwordSchema, hashPassword, verifyPassword } from "@/server/auth/password";
import { computeEffectiveStatus } from "@/server/tenant/status";
import { assertWithinRateLimit, __resetRateLimits } from "@/server/security/rate-limit";
import { AppError } from "@/server/errors";

describe("secure tokens", () => {
  it("generates unique tokens whose hash verifies", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toBe(hashToken(a.raw));
    expect(a.hash).not.toBe(hashToken(b.raw));
  });

  it("matches only valid, unconsumed, unexpired tokens", () => {
    const t = generateToken();
    const future = new Date(Date.now() + 60_000);
    expect(matchToken({ tokenHash: t.hash, expiresAt: future, consumedAt: null }, t.raw)).toBe(true);
    expect(
      matchToken({ tokenHash: t.hash, expiresAt: future, consumedAt: new Date() }, t.raw),
    ).toBe(false);
    expect(
      matchToken(
        { tokenHash: t.hash, expiresAt: new Date(Date.now() - 1), consumedAt: null },
        t.raw,
      ),
    ).toBe(false);
    expect(matchToken({ tokenHash: t.hash, expiresAt: future, consumedAt: null }, "wrong")).toBe(
      false,
    );
    expect(
      matchToken(
        { tokenHash: t.hash, expiresAt: future, consumedAt: null, revokedAt: new Date() },
        t.raw,
      ),
    ).toBe(false);
  });

  it("issues tokens through the repository abstraction", async () => {
    const created: { tokenHash: string; expiresAt: Date; type: string }[] = [];
    const repo = {
      async create(data: { tokenHash: string; expiresAt: Date; type: string }) {
        created.push(data);
      },
      async findByHash() {
        return null;
      },
      async consume() {},
    };
    const token = await issueToken(repo, "u1", "PASSWORD_RESET", 1000);
    expect(created).toHaveLength(1);
    expect(created[0]?.tokenHash).toBe(hashToken(token.raw));
    expect(created[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 500);
  });
});

describe("password policy & hashing", () => {
  it("accepts strong passwords and rejects weak ones", () => {
    expect(passwordSchema.safeParse("Secure#Pass23").success).toBe(true);
    expect(passwordSchema.safeParse("NoDigitsOrSymbols!!").success).toBe(true); // 3 classes
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false); // only 2 classes
    expect(passwordSchema.safeParse("onlyletters").success).toBe(false); // 1 class
  });

  it("hashes and verifies with bcrypt", async () => {
    const hash = await hashPassword("Secure#Pass23");
    expect(hash).not.toContain("Secure#Pass23");
    await expect(verifyPassword("Secure#Pass23", hash)).resolves.toBe(true);
    await expect(verifyPassword("Wrong#Pass23", hash)).resolves.toBe(false);
  });
});

describe("tenant effective status", () => {
  it("degrades an expired trial to READ_ONLY without mutating the row", () => {
    const company = { status: "TRIAL" as const, trialEndsAt: new Date(Date.now() - 60_000) };
    expect(computeEffectiveStatus(company)).toBe("READ_ONLY");
    expect(company.status).toBe("TRIAL");
  });

  it("keeps live trials and active companies", () => {
    expect(
      computeEffectiveStatus({
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() + 60_000),
      }),
    ).toBe("TRIAL");
    expect(computeEffectiveStatus({ status: "ACTIVE", trialEndsAt: null })).toBe("ACTIVE");
  });

  it("suspension and explicit read-only always win", () => {
    expect(
      computeEffectiveStatus({ status: "SUSPENDED", trialEndsAt: new Date(Date.now() + 99999) }),
    ).toBe("SUSPENDED");
    expect(computeEffectiveStatus({ status: "READ_ONLY", trialEndsAt: null })).toBe("READ_ONLY");
  });
});

describe("rate limiting", () => {
  it("blocks after the limit and resets after the window", async () => {
    __resetRateLimits();
    const key = "test:login:x@y.test";
    for (let i = 0; i < 3; i++) assertWithinRateLimit(key, 3, 50);
    expect(() => assertWithinRateLimit(key, 3, 50)).toThrowError(AppError);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(() => assertWithinRateLimit(key, 3, 50)).not.toThrow();
  });
});

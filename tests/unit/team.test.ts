import { describe, expect, it } from "vitest";
import { assertNotSelf, wouldRemoveLastAdmin } from "@/server/services/team.service";

describe("assertNotSelf", () => {
  it("throws when actor targets their own membership", () => {
    expect(() => assertNotSelf("u1", "u1")).toThrowError(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
  });

  it("passes for different users", () => {
    expect(() => assertNotSelf("u1", "u2")).not.toThrow();
  });
});

describe("wouldRemoveLastAdmin", () => {
  it("blocks demoting/disabling the sole active admin", () => {
    expect(wouldRemoveLastAdmin("COMPANY_ADMIN", false, 1)).toBe(true);
    expect(wouldRemoveLastAdmin("COMPANY_ADMIN", false, 0)).toBe(true);
  });

  it("allows it when another active admin exists", () => {
    expect(wouldRemoveLastAdmin("COMPANY_ADMIN", false, 2)).toBe(false);
  });

  it("does not apply to non-admins or to admin promotions", () => {
    expect(wouldRemoveLastAdmin("HR_MANAGER", false, 1)).toBe(false);
    expect(wouldRemoveLastAdmin("COMPANY_ADMIN", true, 1)).toBe(false);
  });
});

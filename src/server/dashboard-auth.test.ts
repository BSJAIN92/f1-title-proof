import { describe, expect, it } from "vitest";
import { createDashboardSession, isDashboardSessionValid, verifyDashboardPassword } from "./dashboard-auth";

describe("dashboard authentication", () => {
  it("checks the configured password", () => {
    expect(verifyDashboardPassword("correct-password", "correct-password")).toBe(true);
    expect(verifyDashboardPassword("wrong-password", "correct-password")).toBe(false);
  });

  it("accepts signed sessions and rejects tampering or expiry", () => {
    const now = 1_800_000_000_000;
    const token = createDashboardSession("a-secure-session-secret-that-is-long", now);
    expect(isDashboardSessionValid(token, "a-secure-session-secret-that-is-long", now + 1_000)).toBe(true);
    expect(isDashboardSessionValid(`${token}x`, "a-secure-session-secret-that-is-long", now + 1_000)).toBe(false);
    expect(isDashboardSessionValid(token, "a-secure-session-secret-that-is-long", now + 8 * 86_400_000)).toBe(false);
  });
});

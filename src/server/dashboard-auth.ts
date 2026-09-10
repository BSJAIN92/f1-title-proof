import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const DASHBOARD_COOKIE = "titleproof_dashboard";
export const DASHBOARD_SESSION_SECONDS = 24 * 60 * 60;

function digest(value: string) { return createHash("sha256").update(value, "utf8").digest(); }
function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload, "utf8").digest("base64url"); }

export function verifyDashboardPassword(candidate: string, configured: string) {
  return configured.length >= 12 && timingSafeEqual(digest(candidate), digest(configured));
}

export function createDashboardSession(secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("DASHBOARD_SESSION_SECRET must contain at least 32 characters.");
  const payload = Buffer.from(JSON.stringify({ expiresAt: now + DASHBOARD_SESSION_SECONDS * 1000 }), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function isDashboardSessionValid(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return false;
  const expected = signature(payload, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: unknown };
    return typeof value.expiresAt === "number" && value.expiresAt > now;
  } catch { return false; }
}

export function dashboardCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "strict" as const, path: "/dashboard", maxAge: DASHBOARD_SESSION_SECONDS };
}

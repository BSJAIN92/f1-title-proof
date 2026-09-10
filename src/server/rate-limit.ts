import "server-only";
import { createHmac } from "node:crypto";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../convex/_generated/api";

export type LimitedAction = "login" | "visit" | "compare" | "calculate" | "selection" | "state" | "reopen" | "comparison_return";
const limits: Record<LimitedAction, { limit: number; windowMs: number }> = {
  login: { limit: 5, windowMs: 15 * 60_000 }, visit: { limit: 30, windowMs: 60_000 }, compare: { limit: 20, windowMs: 60_000 },
  calculate: { limit: 10, windowMs: 60_000 }, selection: { limit: 30, windowMs: 60_000 }, state: { limit: 30, windowMs: 60_000 },
  reopen: { limit: 20, windowMs: 60_000 }, comparison_return: { limit: 30, windowMs: 60_000 },
};

export interface RateLimitDecision { readonly allowed: boolean; readonly retryAfterSeconds: number }

export async function checkRateLimit(request: Request, action: LimitedAction): Promise<RateLimitDecision> {
  const secret = process.env.RATE_LIMIT_SECRET;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const serverCredential = process.env.CONVEX_SERVER_CREDENTIAL;
  if (!secret || secret.length < 32 || !url || !serverCredential) return process.env.NODE_ENV === "production" ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true, retryAfterSeconds: 0 };
  const address = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const hash = createHmac("sha256", secret).update(address, "utf8").digest("hex");
  const config = limits[action];
  try { return await fetchMutation(api.security.consumeRequestLimit, { serverCredential, key: `${action}:${hash}`, now: Date.now(), ...config }, { url }); }
  catch { return process.env.NODE_ENV === "production" ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true, retryAfterSeconds: 0 }; }
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json({ reason: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "private, no-store" } });
}

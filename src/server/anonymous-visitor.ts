import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const COOKIE_NAME = "titleproof_anon";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const VISITOR_ID = /^[A-Za-z0-9_-]{43}$/;

export interface VisitorCookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: ReturnType<typeof cookieOptions>): void;
}

export function cookieOptions(localDevelopment = process.env.NODE_ENV === "development") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: !localDevelopment,
  };
}

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}

export function visitorHash(rawVisitorId: string): string {
  return createHash("sha256").update(rawVisitorId, "utf8").digest("hex");
}

export function getOrCreateAnonymousVisitor(store: VisitorCookieStore, localDevelopment = process.env.NODE_ENV === "development") {
  const existing = store.get(COOKIE_NAME)?.value;
  if (isValidVisitorId(existing)) return { hash: visitorHash(existing), created: false } as const;
  const raw = randomBytes(32).toString("base64url");
  store.set(COOKIE_NAME, raw, cookieOptions(localDevelopment));
  return { hash: visitorHash(raw), created: true } as const;
}

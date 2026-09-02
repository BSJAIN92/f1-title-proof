import { describe, expect, it } from "vitest";
import { COOKIE_NAME, cookieOptions, getOrCreateAnonymousVisitor, isValidVisitorId, visitorHash } from "./anonymous-visitor";

function cookieJar(initial?: string) {
  let value = initial;
  let written: { name: string; value: string; options: ReturnType<typeof cookieOptions> } | undefined;
  return {
    store: {
      get: (name: string) => name === COOKIE_NAME && value ? { value } : undefined,
      set: (name: string, next: string, options: ReturnType<typeof cookieOptions>) => {
        value = next;
        written = { name, value: next, options };
      },
    },
    written: () => written,
  };
}

describe("anonymous visitor identity", () => {
  it("sets a secure HTTP-only browser identifier and hashes it before storage", () => {
    const jar = cookieJar();
    const visitor = getOrCreateAnonymousVisitor(jar.store, false);
    const write = jar.written();
    expect(write?.name).toBe("titleproof_anon");
    expect(write?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000, secure: true });
    expect(isValidVisitorId(write?.value)).toBe(true);
    expect(visitor.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(visitor.hash).not.toContain(write?.value ?? "missing");
  });

  it("reuses a valid identifier and rotates malformed values", () => {
    const raw = "a".repeat(43);
    const valid = cookieJar(raw);
    expect(getOrCreateAnonymousVisitor(valid.store, true)).toEqual({ hash: visitorHash(raw), created: false });
    expect(valid.written()).toBeUndefined();

    const malformed = cookieJar("raw-cookie");
    expect(getOrCreateAnonymousVisitor(malformed.store, true).created).toBe(true);
    expect(malformed.written()?.value).not.toBe("raw-cookie");
    expect(malformed.written()?.options.secure).toBe(false);
  });
});

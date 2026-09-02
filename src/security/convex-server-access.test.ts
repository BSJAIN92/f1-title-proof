import { afterEach, describe, expect, it, vi } from "vitest";
import { requireDeploymentCredential, requireServerCredential } from "../../convex/serverAccess";

const serverCredential = "server-test-credential".padEnd(32, "x");
const seedCredential = "seed-test-credential".padEnd(32, "x");

afterEach(() => vi.unstubAllEnvs());

describe("Convex server credential gates", () => {
  it("rejects direct access when the server credential is missing, unconfigured, or wrong", () => {
    vi.stubEnv("CONVEX_SERVER_CREDENTIAL", "");
    expect(() => requireServerCredential("")).toThrow("not configured");
    vi.stubEnv("CONVEX_SERVER_CREDENTIAL", serverCredential);
    expect(() => requireServerCredential("wrong-credential".padEnd(32, "x"))).toThrow("rejected");
  });

  it("allows only the matching server credential", () => {
    vi.stubEnv("CONVEX_SERVER_CREDENTIAL", serverCredential);
    expect(() => requireServerCredential(serverCredential)).not.toThrow();
  });

  it("keeps deployment seeding behind its separate credential", () => {
    vi.stubEnv("CONVEX_SEED_CREDENTIAL", seedCredential);
    expect(() => requireDeploymentCredential("wrong-credential".padEnd(32, "x"))).toThrow("rejected");
    expect(() => requireDeploymentCredential(seedCredential)).not.toThrow();
  });
});

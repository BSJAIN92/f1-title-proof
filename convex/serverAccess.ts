const MINIMUM_CREDENTIAL_LENGTH = 32;

function sameCredential(provided: string, expected: string): boolean {
  const length = Math.max(provided.length, expected.length);
  let mismatch = provided.length ^ expected.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function requireConfiguredCredential(provided: string, environmentName: "CONVEX_SERVER_CREDENTIAL" | "CONVEX_SEED_CREDENTIAL"): void {
  const expected = process.env[environmentName];
  if (!expected || expected.length < MINIMUM_CREDENTIAL_LENGTH) {
    throw new Error("Server access is not configured for this Convex deployment.");
  }
  if (typeof provided !== "string" || !sameCredential(provided, expected)) {
    throw new Error("Server access was rejected.");
  }
}

export function requireServerCredential(provided: string): void {
  requireConfiguredCredential(provided, "CONVEX_SERVER_CREDENTIAL");
}

export function requireDeploymentCredential(provided: string): void {
  requireConfiguredCredential(provided, "CONVEX_SEED_CREDENTIAL");
}

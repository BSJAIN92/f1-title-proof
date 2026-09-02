import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../../data/frozen/2026-09-01/manifest.json";
import { verifyFrozenDriverSnapshot, type VerifiedFrozenDriverSnapshot } from "../engine/relations/verified-frozen-driver-snapshot";
import type { ApprovedDatasetDocument } from "../convex/contracts";

const base = resolve(process.cwd(), "data", "frozen", "2026-09-01");
const read = (name: string) => readFileSync(resolve(base, name), "utf8");

export function approvedDatasetFixture(): ApprovedDatasetDocument {
  const manifestJson = read("manifest.json");
  const sessionResultsJson = read("session-results.json");
  const countbackJson = read("countback.json");
  const sourceDocumentsJson = read("source-documents.json");
  const verification = verifyFrozenDriverSnapshot({
    manifestBytes: new TextEncoder().encode(manifestJson),
    artifactBytes: {
      "session-results.json": new TextEncoder().encode(sessionResultsJson),
      "countback.json": new TextEncoder().encode(countbackJson),
      "source-documents.json": new TextEncoder().encode(sourceDocumentsJson),
    },
  });
  if (verification.status !== "VERIFIED") throw new Error(verification.reason);
  return {
    dataVersion: manifest.dataVersion,
    ruleVersion: manifest.ruleVersion,
    cutoff: manifest.cutoff.local,
    fingerprint: verification.snapshot.fingerprint,
    status: "approved",
    manifestJson,
    sessionResultsJson,
    countbackJson,
    sourceDocumentsJson,
    approvedAt: Date.parse(manifest.approval.approvedAt),
  };
}

export function approvedSnapshotFixture(): VerifiedFrozenDriverSnapshot {
  const document = approvedDatasetFixture();
  const verification = verifyFrozenDriverSnapshot({
    manifestBytes: new TextEncoder().encode(document.manifestJson),
    artifactBytes: {
      "session-results.json": new TextEncoder().encode(document.sessionResultsJson),
      "countback.json": new TextEncoder().encode(document.countbackJson),
      "source-documents.json": new TextEncoder().encode(document.sourceDocumentsJson),
    },
  });
  if (verification.status !== "VERIFIED") throw new Error(verification.reason);
  return verification.snapshot;
}

import "server-only";
import { parseApprovedDataset, type ApprovedDatasetDocument } from "../convex/contracts";
import { verifyFrozenDriverSnapshot, type VerifiedFrozenDriverSnapshot } from "../engine/relations/verified-frozen-driver-snapshot";
import type { ProductData, StandingView } from "./frozen-product-data";

export type StoredDatasetVerification =
  | { readonly status: "VERIFIED"; readonly snapshot: VerifiedFrozenDriverSnapshot; readonly document: ApprovedDatasetDocument }
  | { readonly status: "CALCULATION_FAILURE"; readonly reason: string };

export function verifyStoredDataset(value: unknown): StoredDatasetVerification {
  let document: ApprovedDatasetDocument;
  try { document = parseApprovedDataset(value); } catch (error) {
    return { status: "CALCULATION_FAILURE", reason: error instanceof Error ? error.message : "The stored dataset is malformed." };
  }
  const verification = verifyFrozenDriverSnapshot({
    manifestBytes: new TextEncoder().encode(document.manifestJson),
    artifactBytes: {
      "session-results.json": new TextEncoder().encode(document.sessionResultsJson),
      "countback.json": new TextEncoder().encode(document.countbackJson),
      "source-documents.json": new TextEncoder().encode(document.sourceDocumentsJson),
    },
  });
  if (verification.status !== "VERIFIED") return { status: "CALCULATION_FAILURE", reason: verification.reason };
  const snapshot = verification.snapshot;
  if (snapshot.dataVersion !== document.dataVersion || snapshot.ruleVersion !== document.ruleVersion || snapshot.cutoff !== document.cutoff || snapshot.fingerprint !== document.fingerprint) {
    return { status: "CALCULATION_FAILURE", reason: "Stored dataset metadata does not match its verified contents." };
  }
  return { status: "VERIFIED", snapshot, document };
}

function standings(rows: readonly { id: string; position: number; points: number }[], maximum: number): StandingView[] {
  const leader = rows[0]?.points ?? 0;
  return rows.map((row) => ({ ...row, gap: row.points - leader, eligible: row.points + maximum >= leader }));
}

export function productDataFromSnapshot(snapshot: VerifiedFrozenDriverSnapshot): ProductData {
  return Object.freeze({
    dataVersion: snapshot.dataVersion,
    ruleVersion: snapshot.ruleVersion,
    cutoff: snapshot.cutoff,
    remainingSessions: snapshot.sessions.length,
    assumptions: ["Every remaining race and Sprint awards full points.", "The regular 22-driver lineup stays fixed.", "Both entered cars score constructor points.", "Points ties use race finishes first, then qualifying results."],
    unsupported: [...snapshot.unsupported],
    standings: {
      driver: standings(snapshot.standings.map((row) => ({ id: row.driverId, position: row.position, points: row.points })), 11 * 25 + 8),
      constructor: standings(snapshot.constructorStandings.map((row) => ({ id: row.constructorId, position: row.position, points: row.points })), 11 * 43 + 15),
    },
  });
}

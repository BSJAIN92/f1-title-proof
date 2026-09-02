import { scoreAndValidateEvent, type EventEntrant, type EventResultInput, type SessionType } from "../events/event-outcome";
import { compareStandings, type ChampionshipStanding } from "../standings/championship-standings";
import { createFutureChampionshipState } from "../search/future-state";
import { proveStateCannotWin, type PruningProof } from "../search/pruning";
import type { VerifiedFrozenDriverSnapshot } from "./verified-frozen-driver-snapshot";

export const APPROVED_FROZEN_SNAPSHOT_FINGERPRINT = "sha256-9b2449140b8985c984a8a4af5a2882a3ebdc9333d94a55b9681a4c4f8f52f2ca";

export interface SymbolicEventConstraint {
  readonly sessionId: string;
  readonly sequenceIndex: number;
  readonly session: SessionType;
  readonly entrantDriverIds: readonly string[];
  readonly legalityPredicate: "M2_EXACT_FULL_POINTS_EVENT";
  readonly variables: readonly (readonly [driverId: string, position: "INTEGER_OR_NULL", status: "FINISHED_DNF_DNS"])[];
}
export interface FrozenDriverSymbolicRelation {
  readonly kind: "DRIVER_WINNING_SET_COMPREHENSION";
  readonly selectedDriverId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly snapshotFingerprint: string;
  readonly roster: readonly EventEntrant[];
  readonly initialStandings: readonly ChampionshipStanding[];
  readonly eventConstraints: readonly SymbolicEventConstraint[];
  readonly finalPredicate: { readonly operation: "STRICTLY_AHEAD_OF_EVERY_RIVAL_USING_M3"; readonly unresolvedEqualityIsWin: false };
}
export interface SymbolicCompletenessCertificate {
  readonly kind: "COMPOSITIONAL_EXACT_RELATION_PROOF";
  readonly obligations: readonly ["EVERY_SESSION_USES_M2_LEGALITY_AND_SCORING", "STATE_FOLD_USES_M3_POINTS_AND_RACE_COUNTBACK", "FINAL_PREDICATE_REQUIRES_STRICT_M3_WIN"];
  readonly approved: true;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly snapshotFingerprint: string;
  readonly sessionCount: number;
  readonly rosterSize: number;
}
export type FrozenSymbolicResult =
  | { readonly status: "COMPLETE"; readonly relation: FrozenDriverSymbolicRelation; readonly certificate: SymbolicCompletenessCertificate }
  | { readonly status: "ELIMINATED"; readonly reason: "MATHEMATICAL_CEILING"; readonly proof: PruningProof }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "STALE_SNAPSHOT" | "INVALID_SNAPSHOT" | "SELECTED_DRIVER_ABSENT"; readonly reason: string };

export interface ApprovedFrozenRelationRequest {
  readonly selectedDriverId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly snapshotFingerprint: string;
}

const genuineDriverRelations = new WeakSet<object>();
const genuineDriverResults = new WeakSet<object>();
const genuineDriverEvidence = new WeakSet<object>();

export function isGenuineFrozenDriverRelation(value: unknown): value is FrozenDriverSymbolicRelation {
  return value !== null && typeof value === "object" && genuineDriverRelations.has(value as object);
}

export function isGenuineFrozenDriverResult(value: unknown): value is FrozenSymbolicResult {
  if (value === null || typeof value !== "object" || !genuineDriverResults.has(value as object)) return false;
  if ((value as FrozenSymbolicResult).status === "COMPLETE") return genuineDriverRelations.has((value as Extract<FrozenSymbolicResult, { status: "COMPLETE" }>).relation) && genuineDriverEvidence.has((value as Extract<FrozenSymbolicResult, { status: "COMPLETE" }>).certificate);
  if ((value as FrozenSymbolicResult).status === "ELIMINATED") return genuineDriverEvidence.has((value as Extract<FrozenSymbolicResult, { status: "ELIMINATED" }>).proof);
  return true;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function buildApprovedFrozenDriverRelationInternal(request: ApprovedFrozenRelationRequest, snapshot: VerifiedFrozenDriverSnapshot): FrozenSymbolicResult {
  if (request === null || typeof request !== "object" || !snapshot || typeof request.selectedDriverId !== "string" || !request.selectedDriverId
    || typeof request.dataVersion !== "string" || typeof request.ruleVersion !== "string" || typeof request.snapshotFingerprint !== "string")
    return { status: "CALCULATION_FAILURE", code: "INVALID_SNAPSHOT", reason: "The driver relation request or verified snapshot is malformed." };
  if (request.dataVersion !== snapshot.dataVersion || request.ruleVersion !== snapshot.ruleVersion || request.snapshotFingerprint !== snapshot.fingerprint)
    return { status: "CALCULATION_FAILURE", code: "STALE_SNAPSHOT", reason: "The requested data, rules, or canonical snapshot fingerprint do not match the approved freeze." };
  const roster = snapshot.roster;
  if (roster.length !== 22 || new Set(roster.map(({ driverId }) => driverId)).size !== 22)
    return { status: "CALCULATION_FAILURE", code: "INVALID_SNAPSHOT", reason: "The approved regular future lineup must contain exactly 22 unique drivers." };
  if (!roster.some(({ driverId }) => driverId === request.selectedDriverId))
    return { status: "CALCULATION_FAILURE", code: "SELECTED_DRIVER_ABSENT", reason: "The selected driver is absent from the approved regular future lineup." };
  const initialStandings = snapshot.standings.map((standing) => ({ competitorId: standing.driverId, points: standing.points, racePositions: standing.racePositions, qualifyingPositions: standing.qualifyingPositions }));
  const remainingSessions = snapshot.sessions;
  const state = createFutureChampionshipState({ kind: "driver", standings: initialStandings, remainingSessions, nextSessionIndex: 0 });
  const proof = proveStateCannotWin(state, request.selectedDriverId);
  if (proof.pruned && proof.rule === "STRICT_POINTS_CEILING") return { status: "ELIMINATED", reason: "MATHEMATICAL_CEILING", proof };
  const eventConstraints = remainingSessions.map((item) => ({ sessionId: item.id, sequenceIndex: item.sequenceIndex, session: item.session,
    entrantDriverIds: roster.map(({ driverId }) => driverId), legalityPredicate: "M2_EXACT_FULL_POINTS_EVENT" as const,
    variables: roster.map(({ driverId }) => [driverId, "INTEGER_OR_NULL", "FINISHED_DNF_DNS"] as const) }));
  const relation: FrozenDriverSymbolicRelation = deepFreeze({ kind: "DRIVER_WINNING_SET_COMPREHENSION", selectedDriverId: request.selectedDriverId,
    dataVersion: request.dataVersion, ruleVersion: request.ruleVersion, snapshotFingerprint: request.snapshotFingerprint,
    roster: Object.freeze(roster.map((item) => Object.freeze(item))), initialStandings: Object.freeze(initialStandings), eventConstraints: Object.freeze(eventConstraints),
    finalPredicate: Object.freeze({ operation: "STRICTLY_AHEAD_OF_EVERY_RIVAL_USING_M3", unresolvedEqualityIsWin: false }),
  });
  genuineDriverRelations.add(relation);
  return { status: "COMPLETE", relation, certificate: Object.freeze({ kind: "COMPOSITIONAL_EXACT_RELATION_PROOF",
    obligations: Object.freeze(["EVERY_SESSION_USES_M2_LEGALITY_AND_SCORING", "STATE_FOLD_USES_M3_POINTS_AND_RACE_COUNTBACK", "FINAL_PREDICATE_REQUIRES_STRICT_M3_WIN"] as const),
    approved: true, dataVersion: request.dataVersion, ruleVersion: request.ruleVersion, snapshotFingerprint: request.snapshotFingerprint,
    sessionCount: remainingSessions.length, rosterSize: roster.length }) };
}

export function buildApprovedFrozenDriverRelation(request: ApprovedFrozenRelationRequest, snapshot: VerifiedFrozenDriverSnapshot): FrozenSymbolicResult {
  const result = deepFreeze(buildApprovedFrozenDriverRelationInternal(request, snapshot));
  genuineDriverResults.add(result);
  if (result.status === "COMPLETE") genuineDriverEvidence.add(result.certificate);
  if (result.status === "ELIMINATED") genuineDriverEvidence.add(result.proof);
  return result;
}

export interface FrozenRawPath {
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly snapshotFingerprint: string;
  readonly sessions: readonly { readonly sessionId: string; readonly session: SessionType; readonly results: readonly EventResultInput[] }[];
}
export type MembershipResult =
  | { readonly status: "VALID"; readonly accepted: boolean; readonly decidedBy: "STRICT_M3_CHAMPION" | "NOT_STRICT_M3_CHAMPION" }
  | { readonly status: "INVALID_PATH"; readonly code: "INVALID_RELATION" | "VERSION_MISMATCH" | "SESSION_MISMATCH" | "ILLEGAL_EVENT"; readonly reason: string };

export type DriverRelationEvaluation = MembershipResult & { readonly finalStandings?: readonly ChampionshipStanding[] };

export function evaluateFrozenDriverRelation(relation: FrozenDriverSymbolicRelation, path: FrozenRawPath): DriverRelationEvaluation {
  if (relation === null || typeof relation !== "object" || !genuineDriverRelations.has(relation as object))
    return { status: "INVALID_PATH", code: "INVALID_RELATION", reason: "The relation was not produced by the approved driver relation builder." };
  if (path === null || typeof path !== "object") return { status: "INVALID_PATH", code: "SESSION_MISMATCH", reason: "The driver path is absent or malformed." };
  if (path.dataVersion !== relation.dataVersion || path.ruleVersion !== relation.ruleVersion || path.snapshotFingerprint !== relation.snapshotFingerprint)
    return { status: "INVALID_PATH", code: "VERSION_MISMATCH", reason: "The path versions or snapshot fingerprint do not match the relation." };
  if (!Array.isArray(path.sessions) || path.sessions.length !== relation.eventConstraints.length)
    return { status: "INVALID_PATH", code: "SESSION_MISMATCH", reason: "The path must supply exactly one result for every frozen future session." };
  const standings = relation.initialStandings.map((standing) => ({ ...standing, racePositions: { ...standing.racePositions }, qualifyingPositions: { ...standing.qualifyingPositions } }));
  for (let index = 0; index < path.sessions.length; index += 1) {
    const supplied = path.sessions[index], expected = relation.eventConstraints[index];
    if (!supplied || supplied.sessionId !== expected.sessionId || supplied.session !== expected.session)
      return { status: "INVALID_PATH", code: "SESSION_MISMATCH", reason: `Future session ${index} is missing, extra, or out of order.` };
    let scored;
    try { scored = scoreAndValidateEvent(expected.session, relation.roster, supplied.results); }
    catch (error) { return { status: "INVALID_PATH", code: "ILLEGAL_EVENT", reason: error instanceof Error ? error.message : "A future event result is illegal." }; }
    const byDriver = new Map(scored.map((result) => [result.driverId, result]));
    for (const standing of standings) {
      const result = byDriver.get(standing.competitorId)!;
      standing.points += result.awardedPoints;
      if (expected.session === "race" && result.position !== null) standing.racePositions[result.position] = (standing.racePositions[result.position] ?? 0) + 1;
    }
  }
  const selected = standings.find(({ competitorId }) => competitorId === relation.selectedDriverId)!;
  const accepted = standings.filter(({ competitorId }) => competitorId !== relation.selectedDriverId).every((rival) => compareStandings(selected, rival).outcome === "ahead");
  return { status: "VALID", accepted, decidedBy: accepted ? "STRICT_M3_CHAMPION" : "NOT_STRICT_M3_CHAMPION", finalStandings: deepFreeze(standings) };
}

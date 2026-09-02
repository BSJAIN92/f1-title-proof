import { scoreAndValidateEvent, type EventResultInput, type SessionType } from "../events/event-outcome";
import { compareStandings, type ChampionshipStanding } from "../standings/championship-standings";
import { createFutureChampionshipState } from "../search/future-state";
import { proveStateCannotWin, type PruningProof } from "../search/pruning";
import type { VerifiedFrozenDriverSnapshot } from "./verified-frozen-driver-snapshot";

export interface ConstructorEventConstraint { readonly sessionId: string; readonly sequenceIndex: number; readonly session: SessionType; readonly legalityPredicate: "M2_EXACT_FULL_POINTS_EVENT"; readonly driverAssignments: readonly { readonly driverId: string; readonly constructorId: string }[] }
export interface FrozenConstructorSymbolicRelation {
  readonly kind: "CONSTRUCTOR_WINNING_SET_COMPREHENSION"; readonly selectedConstructorId: string; readonly dataVersion: string; readonly ruleVersion: string; readonly snapshotFingerprint: string;
  readonly roster: readonly { readonly driverId: string; readonly constructorId: string }[]; readonly initialStandings: readonly ChampionshipStanding[]; readonly eventConstraints: readonly ConstructorEventConstraint[];
  readonly finalPredicate: { readonly operation: "STRICTLY_AHEAD_OF_EVERY_CONSTRUCTOR_USING_M3"; readonly bothCarsScore: true; readonly sprintCountbackExcluded: true; readonly unresolvedEqualityIsWin: false };
}
export type ConstructorRelationResult =
  | { readonly status: "COMPLETE"; readonly relation: FrozenConstructorSymbolicRelation; readonly certificate: { readonly kind: "COMPOSITIONAL_EXACT_CONSTRUCTOR_RELATION_PROOF"; readonly dataVersion: string; readonly ruleVersion: string; readonly snapshotFingerprint: string; readonly selectedConstructorId: string; readonly rosterSize: 22; readonly constructorCount: 11; readonly sessionCount: 12; readonly obligations: readonly string[] } }
  | { readonly status: "ELIMINATED"; readonly reason: "MATHEMATICAL_CEILING"; readonly proof: PruningProof }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "STALE_SNAPSHOT" | "INVALID_SNAPSHOT" | "SELECTED_CONSTRUCTOR_ABSENT"; readonly reason: string };
export interface ConstructorRelationRequest { readonly selectedConstructorId: string; readonly dataVersion: string; readonly ruleVersion: string; readonly snapshotFingerprint: string }
const genuineConstructorRelations = new WeakSet<object>();
const genuineConstructorResults = new WeakSet<object>();
const genuineConstructorEvidence = new WeakSet<object>();
export function isGenuineFrozenConstructorRelation(value: unknown): value is FrozenConstructorSymbolicRelation {
  return value !== null && typeof value === "object" && genuineConstructorRelations.has(value as object);
}
export function isGenuineFrozenConstructorResult(value: unknown): value is ConstructorRelationResult {
  if (value === null || typeof value !== "object" || !genuineConstructorResults.has(value as object)) return false;
  if ((value as ConstructorRelationResult).status === "COMPLETE") return genuineConstructorRelations.has((value as Extract<ConstructorRelationResult, { status: "COMPLETE" }>).relation) && genuineConstructorEvidence.has((value as Extract<ConstructorRelationResult, { status: "COMPLETE" }>).certificate);
  if ((value as ConstructorRelationResult).status === "ELIMINATED") return genuineConstructorEvidence.has((value as Extract<ConstructorRelationResult, { status: "ELIMINATED" }>).proof);
  return true;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function buildApprovedFrozenConstructorRelationInternal(request: ConstructorRelationRequest, snapshot: VerifiedFrozenDriverSnapshot): ConstructorRelationResult {
  if (request === null || typeof request !== "object" || typeof request.selectedConstructorId !== "string" || !request.selectedConstructorId
    || typeof request.dataVersion !== "string" || !request.dataVersion || typeof request.ruleVersion !== "string" || !request.ruleVersion
    || typeof request.snapshotFingerprint !== "string" || !request.snapshotFingerprint)
    return { status: "CALCULATION_FAILURE", code: "INVALID_SNAPSHOT", reason: "The constructor relation request is absent or malformed." };
  if (!snapshot) return { status: "CALCULATION_FAILURE", code: "INVALID_SNAPSHOT", reason: "The verified snapshot is unavailable." };
  if (request.dataVersion !== snapshot.dataVersion || request.ruleVersion !== snapshot.ruleVersion || request.snapshotFingerprint !== snapshot.fingerprint) return { status: "CALCULATION_FAILURE", code: "STALE_SNAPSHOT", reason: "The request does not match the verified approved snapshot." };
  if (!snapshot.constructorStandings.some(({ constructorId }) => constructorId === request.selectedConstructorId)) return { status: "CALCULATION_FAILURE", code: "SELECTED_CONSTRUCTOR_ABSENT", reason: "The selected constructor is absent from the approved frozen standings." };
  const standings = snapshot.constructorStandings.map((standing) => ({ competitorId: standing.constructorId, points: standing.points, racePositions: standing.racePositions, qualifyingPositions: standing.qualifyingPositions }));
  const state = createFutureChampionshipState({ kind: "constructor", standings, remainingSessions: snapshot.sessions, nextSessionIndex: 0 });
  const proof = proveStateCannotWin(state, request.selectedConstructorId);
  if (proof.pruned && proof.rule === "STRICT_POINTS_CEILING") return { status: "ELIMINATED", reason: "MATHEMATICAL_CEILING", proof };
  const relation: FrozenConstructorSymbolicRelation = deepFreeze({ kind: "CONSTRUCTOR_WINNING_SET_COMPREHENSION", selectedConstructorId: request.selectedConstructorId, dataVersion: snapshot.dataVersion, ruleVersion: snapshot.ruleVersion, snapshotFingerprint: snapshot.fingerprint,
    roster: snapshot.roster.map((entry) => ({ ...entry })), initialStandings: standings.map((standing) => ({ ...standing, racePositions: { ...standing.racePositions }, qualifyingPositions: { ...standing.qualifyingPositions } })), eventConstraints: snapshot.sessions.map((session) => ({ sessionId: session.id, sequenceIndex: session.sequenceIndex, session: session.session, legalityPredicate: "M2_EXACT_FULL_POINTS_EVENT" as const, driverAssignments: snapshot.roster.map((entry) => ({ ...entry })) })),
    finalPredicate: { operation: "STRICTLY_AHEAD_OF_EVERY_CONSTRUCTOR_USING_M3", bothCarsScore: true, sprintCountbackExcluded: true, unresolvedEqualityIsWin: false } });
  genuineConstructorRelations.add(relation);
  return { status: "COMPLETE", relation, certificate: deepFreeze({ kind: "COMPOSITIONAL_EXACT_CONSTRUCTOR_RELATION_PROOF", dataVersion: snapshot.dataVersion, ruleVersion: snapshot.ruleVersion, snapshotFingerprint: snapshot.fingerprint, selectedConstructorId: request.selectedConstructorId, rosterSize: 22, constructorCount: 11, sessionCount: 12,
    obligations: ["EVERY_EVENT_IS_M2_LEGAL", "BOTH_FROZEN_ASSIGNED_CARS_SCORE", "ONLY_RACE_FINISHES_UPDATE_COUNTBACK", "M3_STRICT_CONSTRUCTOR_COMPARISON"] }) };
}

export function buildApprovedFrozenConstructorRelation(request: ConstructorRelationRequest, snapshot: VerifiedFrozenDriverSnapshot): ConstructorRelationResult {
  const result = deepFreeze(buildApprovedFrozenConstructorRelationInternal(request, snapshot));
  genuineConstructorResults.add(result);
  if (result.status === "COMPLETE") genuineConstructorEvidence.add(result.certificate);
  if (result.status === "ELIMINATED") genuineConstructorEvidence.add(result.proof);
  return result;
}

export interface ConstructorRawPath { readonly dataVersion: string; readonly ruleVersion: string; readonly snapshotFingerprint: string; readonly sessions: readonly { readonly sessionId: string; readonly session: SessionType; readonly results: readonly EventResultInput[] }[] }
export type ConstructorMembership = { readonly status: "VALID"; readonly accepted: boolean; readonly decidedBy: "STRICT_M3_CHAMPION" | "NOT_STRICT_M3_CHAMPION"; readonly finalStandings: readonly ChampionshipStanding[] } | { readonly status: "INVALID_PATH"; readonly code: "INVALID_RELATION" | "VERSION_MISMATCH" | "SESSION_MISMATCH" | "ILLEGAL_EVENT"; readonly reason: string };

export function evaluateFrozenConstructorRelation(relation: FrozenConstructorSymbolicRelation, path: ConstructorRawPath): ConstructorMembership {
  if (relation === null || typeof relation !== "object" || !genuineConstructorRelations.has(relation as object)) return { status: "INVALID_PATH", code: "INVALID_RELATION", reason: "The relation was not produced by the approved constructor relation builder." };
  if (path === null || typeof path !== "object") return { status: "INVALID_PATH", code: "SESSION_MISMATCH", reason: "The constructor path is absent or malformed." };
  if (path.dataVersion !== relation.dataVersion || path.ruleVersion !== relation.ruleVersion || path.snapshotFingerprint !== relation.snapshotFingerprint) return { status: "INVALID_PATH", code: "VERSION_MISMATCH", reason: "The path does not match relation versions or fingerprint." };
  if (!Array.isArray(path.sessions) || path.sessions.length !== relation.eventConstraints.length) return { status: "INVALID_PATH", code: "SESSION_MISMATCH", reason: "Exactly one ordered result per frozen session is required." };
  const standings = relation.initialStandings.map((standing) => ({ ...standing, racePositions: { ...standing.racePositions }, qualifyingPositions: { ...standing.qualifyingPositions } }));
  const standingMap = new Map(standings.map((standing) => [standing.competitorId, standing]));
  for (let index = 0; index < path.sessions.length; index += 1) {
    const supplied = path.sessions[index], expected = relation.eventConstraints[index];
    if (!supplied || supplied.sessionId !== expected.sessionId || supplied.session !== expected.session) return { status: "INVALID_PATH", code: "SESSION_MISMATCH", reason: `Session ${index} is missing, extra, or out of order.` };
    let scored;
    try { scored = scoreAndValidateEvent(expected.session, relation.roster, supplied.results); }
    catch (error) { return { status: "INVALID_PATH", code: "ILLEGAL_EVENT", reason: error instanceof Error ? error.message : "An event is illegal." }; }
    for (const result of scored) {
      const standing = standingMap.get(result.constructorId);
      if (!standing) return { status: "INVALID_PATH", code: "ILLEGAL_EVENT", reason: "A result uses an unverified constructor assignment." };
      standing.points += result.awardedPoints;
      if (expected.session === "race" && result.position !== null) standing.racePositions[result.position] = (standing.racePositions[result.position] ?? 0) + 1;
    }
  }
  const selected = standingMap.get(relation.selectedConstructorId)!;
  const accepted = standings.filter(({ competitorId }) => competitorId !== relation.selectedConstructorId).every((rival) => compareStandings(selected, rival).outcome === "ahead");
  return { status: "VALID", accepted, decidedBy: accepted ? "STRICT_M3_CHAMPION" : "NOT_STRICT_M3_CHAMPION", finalStandings: deepFreeze(standings) };
}

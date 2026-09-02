import { scoreAndValidateEvent, type EventEntrant, type ScoredEventResult, type SessionType } from "../events/event-outcome";
import { compareStandings, type ChampionshipStanding } from "../standings/championship-standings";
import { createFutureChampionshipState, futureStateKey, type FutureChampionshipState, type RemainingSession } from "../search/future-state";
import { proveStateCannotWin, type PruningProof } from "../search/pruning";
import { enumerateEventOutcomes } from "../oracle/direct-enumerator";

export const DRIVER_RELATION_RULE_VERSION = "driver-winning-relation-v1";

export interface CompleteFutureSessionDomainInput {
  readonly sessionId: string;
  readonly sequenceIndex: number;
  readonly session: SessionType;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly entrants: readonly EventEntrant[];
}

export interface TrustedFutureSessionDomain {
  readonly sessionId: string;
  readonly sequenceIndex: number;
  readonly session: SessionType;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly entrants: readonly EventEntrant[];
  readonly outcomes: readonly { readonly id: string; readonly results: readonly ScoredEventResult[] }[];
  readonly certificate: { readonly method: "EXHAUSTIVE_BOUNDED_ENUMERATION"; readonly outcomeCount: number };
}

export type DomainFailureCode =
  | "INCOMPLETE_DOMAIN" | "DUPLICATE_OUTCOME_ID" | "INVALID_OUTCOME" | "SESSION_ALIGNMENT_MISMATCH"
  | "VERSION_MISMATCH" | "SELECTED_DRIVER_ABSENT" | "INVALID_INPUT" | "RESOURCE_LIMIT_EXCEEDED";

export type DomainConstructionResult =
  | { readonly status: "TRUSTED"; readonly domain: TrustedFutureSessionDomain }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: DomainFailureCode; readonly reason: string };

function failure(code: DomainFailureCode, reason: string): DomainConstructionResult {
  return { status: "CALCULATION_FAILURE", code, reason };
}

function freezeResults(results: readonly ScoredEventResult[]): readonly ScoredEventResult[] {
  return Object.freeze(results.map((result) => Object.freeze({ ...result })));
}

const internallyGeneratedDomains = new WeakSet<object>();

/** Internally generates the entire legal bounded domain; callers cannot supply or attest outcomes. */
export function createTrustedFutureSessionDomain(input: CompleteFutureSessionDomainInput): DomainConstructionResult {
  if (!input || !input.sessionId || !Number.isInteger(input.sequenceIndex) || input.sequenceIndex < 0
    || (input.session !== "race" && input.session !== "sprint") || !input.dataVersion || !input.ruleVersion
    || !Array.isArray(input.entrants)) {
    return failure("INVALID_INPUT", "The future-session domain metadata is absent or malformed.");
  }
  if (input.entrants.some((entrant) => !entrant.driverId || !entrant.constructorId)
    || new Set(input.entrants.map((entrant) => entrant.driverId)).size !== input.entrants.length)
    return failure("INVALID_INPUT", "The entrant roster requires non-empty driver and constructor IDs and unique drivers.");
  let generated;
  try { generated = enumerateEventOutcomes({ id: input.sessionId, session: input.session, entrants: input.entrants }); }
  catch (error) { return failure("RESOURCE_LIMIT_EXCEEDED", error instanceof Error ? error.message : "The bounded exhaustive domain could not be generated."); }
  const outcomes = generated.map((outcome) => ({ id: outcome.id, results: freezeResults(outcome.results) }));
  const trusted = Object.freeze({
    sessionId: input.sessionId, sequenceIndex: input.sequenceIndex, session: input.session,
    dataVersion: input.dataVersion, ruleVersion: input.ruleVersion,
    entrants: Object.freeze(input.entrants.map((entrant) => Object.freeze({ ...entrant }))),
    outcomes: Object.freeze(outcomes.map((outcome) => Object.freeze(outcome))),
    certificate: Object.freeze({ method: "EXHAUSTIVE_BOUNDED_ENUMERATION" as const, outcomeCount: outcomes.length }),
  });
  internallyGeneratedDomains.add(trusted);
  return {
    status: "TRUSTED",
    domain: trusted,
  };
}

export interface RelationEdge { readonly outcomeId: string; readonly destination: string | "ACCEPT" | "REJECT" }
export interface RelationNode { readonly id: string; readonly sessionId: string; readonly edges: readonly RelationEdge[] }
export interface DriverWinningRelation {
  readonly rootNodeId: string | "ACCEPT";
  readonly nodes: readonly RelationNode[];
  readonly sessionIds: readonly string[];
}
export interface RelationCompletenessCertificate {
  readonly kind: "EXHAUSTIVE_TRUSTED_DOMAINS_WITH_PROOF_SAFE_PRUNING";
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly domainOutcomeCounts: readonly number[];
  readonly exploredEdges: number;
  readonly mergedStateHits: number;
  readonly pruningProofs: readonly PruningProof[];
}
export type DriverRelationResult =
  | { readonly status: "COMPLETE"; readonly relation: DriverWinningRelation; readonly certificate: RelationCompletenessCertificate }
  | { readonly status: "ELIMINATED"; readonly reason: "MATHEMATICAL_CEILING" | "EXHAUSTIVE_SEARCH_EMPTY"; readonly proof: PruningProof | RelationCompletenessCertificate }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: DomainFailureCode; readonly reason: string };

export interface DriverRelationQuestion {
  readonly selectedDriverId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly initialStandings: readonly ChampionshipStanding[];
  readonly domains: readonly TrustedFutureSessionDomain[];
  readonly maxExploredEdges: number;
}

function addOutcome(state: FutureChampionshipState, session: SessionType, results: readonly ScoredEventResult[]): FutureChampionshipState {
  const additions = new Map(results.map((result) => [result.driverId, result]));
  return createFutureChampionshipState({ ...state, nextSessionIndex: state.nextSessionIndex + 1,
    standings: state.standings.map((standing) => {
      const result = additions.get(standing.competitorId);
      if (!result) return standing;
      const racePositions = { ...standing.racePositions };
      if (session === "race" && result.position !== null) racePositions[result.position] = (racePositions[result.position] ?? 0) + 1;
      return { ...standing, points: standing.points + result.awardedPoints, racePositions };
    }),
  });
}

function strictChampion(state: FutureChampionshipState, selectedDriverId: string): boolean {
  const selected = state.standings.find((standing) => standing.competitorId === selectedDriverId);
  return !!selected && state.standings.filter((standing) => standing.competitorId !== selectedDriverId)
    .every((rival) => compareStandings(selected, rival).outcome === "ahead");
}

export function calculateDriverWinningRelation(question: DriverRelationQuestion): DriverRelationResult {
  if (!question || !question.selectedDriverId || !question.dataVersion || !question.ruleVersion
    || !Array.isArray(question.initialStandings) || !Array.isArray(question.domains)
    || !Number.isInteger(question.maxExploredEdges) || question.maxExploredEdges < 0) {
    return { status: "CALCULATION_FAILURE", code: "INVALID_INPUT", reason: "The driver relation question is absent or malformed." };
  }
  if (!question.initialStandings.some((standing) => standing.competitorId === question.selectedDriverId))
    return { status: "CALCULATION_FAILURE", code: "SELECTED_DRIVER_ABSENT", reason: "The selected driver is absent from the initial standings." };
  const competitorIds = question.initialStandings.map((standing) => standing.competitorId);
  if (competitorIds.some((id) => !id) || new Set(competitorIds).size !== competitorIds.length)
    return { status: "CALCULATION_FAILURE", code: "INVALID_INPUT", reason: "Initial standings require non-empty, unique competitor IDs." };
  const competitorSetKey = [...competitorIds].sort((a, b) => a.localeCompare(b)).join("\u0000");
  let entrantAssignmentKey: string | null = null;
  for (let index = 0; index < question.domains.length; index += 1) {
    const domain = question.domains[index];
    if (!domain || domain.sequenceIndex !== index || !domain.sessionId || question.domains.slice(0, index).some((earlier) => earlier.sessionId === domain.sessionId)
      || (domain.session !== "race" && domain.session !== "sprint")) return { status: "CALCULATION_FAILURE", code: "SESSION_ALIGNMENT_MISMATCH", reason: "Future-session domains must use unique session IDs and contiguous sequence indexes in supplied order." };
    if (domain.dataVersion !== question.dataVersion || domain.ruleVersion !== question.ruleVersion)
      return { status: "CALCULATION_FAILURE", code: "VERSION_MISMATCH", reason: "Every future-session domain must match the question data and rule versions." };
    if (!internallyGeneratedDomains.has(domain as object))
      return { status: "CALCULATION_FAILURE", code: "INCOMPLETE_DOMAIN", reason: `Session ${domain.sessionId} was not produced by the exhaustive bounded-domain generator.` };
    if (!domain.certificate || domain.certificate.method !== "EXHAUSTIVE_BOUNDED_ENUMERATION"
      || domain.certificate.outcomeCount !== domain.outcomes.length)
      return { status: "CALCULATION_FAILURE", code: "INCOMPLETE_DOMAIN", reason: `Session ${domain.sessionId} lacks valid completeness evidence.` };
    const entrantIds = domain.entrants.map((entrant: EventEntrant) => entrant.driverId);
    if (new Set(entrantIds).size !== entrantIds.length || [...entrantIds].sort((a, b) => a.localeCompare(b)).join("\u0000") !== competitorSetKey)
      return { status: "CALCULATION_FAILURE", code: "SESSION_ALIGNMENT_MISMATCH", reason: `Session ${domain.sessionId} entrant set must exactly match the driver championship competitor set.` };
    const assignmentKey = [...domain.entrants].sort((a, b) => a.driverId.localeCompare(b.driverId)).map((entrant) => `${entrant.driverId}:${entrant.constructorId}`).join("\u0000");
    if (entrantAssignmentKey !== null && assignmentKey !== entrantAssignmentKey)
      return { status: "CALCULATION_FAILURE", code: "SESSION_ALIGNMENT_MISMATCH", reason: "All future sessions must use the same frozen driver-constructor assignments." };
    entrantAssignmentKey = assignmentKey;
    let regenerated;
    try { regenerated = enumerateEventOutcomes({ id: domain.sessionId, session: domain.session, entrants: domain.entrants }); }
    catch (error) { return { status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT_EXCEEDED", reason: error instanceof Error ? error.message : "The domain could not be regenerated." }; }
    if (regenerated.length !== domain.outcomes.length || regenerated.some((outcome, outcomeIndex) => outcome.id !== domain.outcomes[outcomeIndex].id))
      return { status: "CALCULATION_FAILURE", code: "INCOMPLETE_DOMAIN", reason: `Session ${domain.sessionId} does not equal its regenerated exhaustive canonical domain.` };
    const outcomeIds = new Set<string>();
    for (const outcome of domain.outcomes) {
      if (!outcome.id || outcomeIds.has(outcome.id)) return { status: "CALCULATION_FAILURE", code: "DUPLICATE_OUTCOME_ID", reason: `Session ${domain.sessionId} has missing or duplicate outcome IDs.` };
      outcomeIds.add(outcome.id);
      try {
        const rescored = scoreAndValidateEvent(domain.session, domain.entrants, outcome.results);
        if (rescored.some((result, resultIndex) => result.awardedPoints !== outcome.results[resultIndex].awardedPoints
          || result.constructorId !== outcome.results[resultIndex].constructorId))
          return { status: "CALCULATION_FAILURE", code: "INVALID_OUTCOME", reason: `Session ${domain.sessionId} contains an outcome whose stored scoring is not valid.` };
      } catch (error) {
        return { status: "CALCULATION_FAILURE", code: "INVALID_OUTCOME", reason: error instanceof Error ? error.message : `Session ${domain.sessionId} contains an invalid outcome.` };
      }
    }
    if (!domain.entrants.some((entrant: EventEntrant) => entrant.driverId === question.selectedDriverId))
      return { status: "CALCULATION_FAILURE", code: "SELECTED_DRIVER_ABSENT", reason: `The selected driver is absent from session ${domain.sessionId}.` };
  }
  const remainingSessions: readonly RemainingSession[] = question.domains.map((domain, sequenceIndex) => ({ id: domain.sessionId, session: domain.session, sequenceIndex }));
  let initial: FutureChampionshipState;
  try { initial = createFutureChampionshipState({ kind: "driver", standings: question.initialStandings, remainingSessions, nextSessionIndex: 0 }); }
  catch (error) { return { status: "CALCULATION_FAILURE", code: "INVALID_INPUT", reason: error instanceof Error ? error.message : "Initial standings are malformed." }; }

  const initialProof = proveStateCannotWin(initial, question.selectedDriverId);
  if (initialProof.pruned && initialProof.rule === "STRICT_POINTS_CEILING") return { status: "ELIMINATED", reason: "MATHEMATICAL_CEILING", proof: initialProof };
  if (question.domains.length === 0) {
    if (strictChampion(initial, question.selectedDriverId)) return { status: "COMPLETE", relation: { rootNodeId: "ACCEPT", nodes: [], sessionIds: [] }, certificate: { kind: "EXHAUSTIVE_TRUSTED_DOMAINS_WITH_PROOF_SAFE_PRUNING", dataVersion: question.dataVersion, ruleVersion: question.ruleVersion, domainOutcomeCounts: [], exploredEdges: 0, mergedStateHits: 0, pruningProofs: [] } };
    return { status: "ELIMINATED", reason: "EXHAUSTIVE_SEARCH_EMPTY", proof: initialProof };
  }

  let exploredEdges = 0, mergedStateHits = 0;
  const pruningProofs: PruningProof[] = [];
  const memo = new Map<string, string | "ACCEPT" | "REJECT">();
  const nodes = new Map<string, RelationNode>();
  const visit = (state: FutureChampionshipState): string | "ACCEPT" | "REJECT" => {
    const proof = proveStateCannotWin(state, question.selectedDriverId);
    if (proof.pruned) { pruningProofs.push(proof); return "REJECT"; }
    if (state.nextSessionIndex === question.domains.length) return strictChampion(state, question.selectedDriverId) ? "ACCEPT" : "REJECT";
    const key = futureStateKey(state);
    const prior = memo.get(key);
    if (prior) { mergedStateHits += 1; return prior; }
    const nodeId = `N${memo.size}`;
    memo.set(key, nodeId);
    const domain = question.domains[state.nextSessionIndex];
    const edges: RelationEdge[] = [];
    for (const outcome of domain.outcomes) {
      exploredEdges += 1;
      if (exploredEdges > question.maxExploredEdges) throw new Error("RESOURCE_LIMIT_EXCEEDED");
      edges.push({ outcomeId: outcome.id, destination: visit(addOutcome(state, domain.session, outcome.results)) });
    }
    nodes.set(nodeId, Object.freeze({ id: nodeId, sessionId: domain.sessionId, edges: Object.freeze(edges) }));
    return nodeId;
  };
  let rootNodeId: string | "ACCEPT" | "REJECT";
  try { rootNodeId = visit(initial); }
  catch { return { status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT_EXCEEDED", reason: `The exact search exceeded the configured ${question.maxExploredEdges}-edge limit; no partial relation was returned.` }; }
  const certificate: RelationCompletenessCertificate = Object.freeze({ kind: "EXHAUSTIVE_TRUSTED_DOMAINS_WITH_PROOF_SAFE_PRUNING", dataVersion: question.dataVersion, ruleVersion: question.ruleVersion, domainOutcomeCounts: Object.freeze(question.domains.map((domain) => domain.outcomes.length)), exploredEdges, mergedStateHits, pruningProofs: Object.freeze(pruningProofs) });
  const hasWinningPath = rootNodeId === "ACCEPT" || [...nodes.values()].some((node) => node.edges.some((edge) => edge.destination === "ACCEPT"));
  if (!hasWinningPath || rootNodeId === "REJECT") return { status: "ELIMINATED", reason: "EXHAUSTIVE_SEARCH_EMPTY", proof: certificate };
  return { status: "COMPLETE", relation: Object.freeze({ rootNodeId, nodes: Object.freeze([...nodes.values()].sort((a, b) => a.id.localeCompare(b.id))), sessionIds: Object.freeze(question.domains.map((domain) => domain.sessionId)) }), certificate };
}

export function relationAccepts(relation: DriverWinningRelation, rawOutcomeIds: readonly string[]): boolean {
  if (rawOutcomeIds.length !== relation.sessionIds.length) return false;
  let cursor: string | "ACCEPT" | "REJECT" = relation.rootNodeId;
  const nodes = new Map(relation.nodes.map((node) => [node.id, node]));
  for (const outcomeId of rawOutcomeIds) {
    if (cursor === "ACCEPT" || cursor === "REJECT") return false;
    const edge = nodes.get(cursor)?.edges.find((candidate) => candidate.outcomeId === outcomeId);
    if (!edge) return false;
    cursor = edge.destination;
  }
  return cursor === "ACCEPT";
}

/** Bounded verification helper; callers choose a maximum result count. */
export function enumerateAcceptedRawPathIds(relation: DriverWinningRelation, maximumPaths: number): readonly string[] {
  if (!Number.isInteger(maximumPaths) || maximumPaths <= 0) throw new Error("maximumPaths must be a positive integer.");
  const nodes = new Map(relation.nodes.map((node) => [node.id, node]));
  if (nodes.size !== relation.nodes.length) throw new Error("The relation contains duplicate node IDs.");
  const accepted: string[] = [];
  const active = new Set<string>();
  const walk = (cursor: string | "ACCEPT" | "REJECT", prefix: readonly string[]): void => {
    if (cursor === "REJECT") return;
    if (cursor === "ACCEPT") {
      if (prefix.length === relation.sessionIds.length) {
        if (accepted.length === maximumPaths) throw new Error(`Accepted path enumeration exceeded the configured ${maximumPaths}-path limit.`);
        accepted.push(prefix.join("+"));
      }
      return;
    }
    const node = nodes.get(cursor);
    if (!node) throw new Error(`The relation references missing node ${cursor}.`);
    if (active.has(cursor)) throw new Error("The relation contains a cycle.");
    if (prefix.length >= relation.sessionIds.length) throw new Error("The relation exceeds its declared session sequence.");
    active.add(cursor);
    for (const edge of node.edges) walk(edge.destination, [...prefix, edge.outcomeId]);
    active.delete(cursor);
  };
  walk(relation.rootNodeId, []);
  return Object.freeze(accepted.sort((a, b) => a.localeCompare(b)));
}

import { compareStandings, type ChampionshipStanding } from "../standings/championship-standings";
import { accumulateTinyPathStandings, enumerateEventOutcomes, enumerateWinningRawOutcomes, type TinyChampionshipQuestion } from "../oracle/direct-enumerator";
import {
  evaluateFrozenDriverRelation, isGenuineFrozenDriverRelation, isGenuineFrozenDriverResult,
  type FrozenDriverSymbolicRelation, type FrozenRawPath, type FrozenSymbolicResult,
} from "../relations/frozen-driver-symbolic-relation";
import {
  evaluateFrozenConstructorRelation, isGenuineFrozenConstructorRelation, isGenuineFrozenConstructorResult,
  type ConstructorRawPath, type ConstructorRelationResult, type FrozenConstructorSymbolicRelation,
} from "../relations/frozen-constructor-symbolic-relation";

export const WINNING_GROUP_RULE_VERSION = "winning-groups-v1";

export type GroupId = "POINTS_AHEAD" | "COUNTBACK_WIN";
export type GroupPredicate =
  | { readonly operation: "ALL_RIVALS"; readonly test: "SELECTED_POINTS_STRICTLY_GREATER" }
  | { readonly operation: "AND"; readonly tests: readonly [
      { readonly operation: "EXISTS_RIVAL"; readonly test: "FINAL_POINTS_EQUAL" },
      { readonly operation: "ALL_RIVALS"; readonly test: "FINAL_POINTS_NOT_GREATER" },
      { readonly operation: "ALL_TIED_RIVALS"; readonly test: "SELECTED_STRICTLY_AHEAD_BY_M3_RACE_THEN_QUALIFYING" },
    ] };

export interface WinningGroupDefinition {
  readonly id: GroupId;
  readonly predicate: GroupPredicate;
}

const DEFINITIONS: readonly WinningGroupDefinition[] = deepFreeze(([
  Object.freeze({ id: "POINTS_AHEAD" as const, predicate: Object.freeze({ operation: "ALL_RIVALS" as const, test: "SELECTED_POINTS_STRICTLY_GREATER" as const }) }),
  Object.freeze({ id: "COUNTBACK_WIN" as const, predicate: Object.freeze({ operation: "AND" as const, tests: Object.freeze([
    Object.freeze({ operation: "EXISTS_RIVAL" as const, test: "FINAL_POINTS_EQUAL" as const }),
    Object.freeze({ operation: "ALL_RIVALS" as const, test: "FINAL_POINTS_NOT_GREATER" as const }),
    Object.freeze({ operation: "ALL_TIED_RIVALS" as const, test: "SELECTED_STRICTLY_AHEAD_BY_M3_RACE_THEN_QUALIFYING" as const }),
  ] as const) }) }),
] as const));

export interface GroupCertificate {
  readonly kind: "ALGEBRAIC_EXECUTABLE_PARTITION_PROOF";
  readonly groupRuleVersion: typeof WINNING_GROUP_RULE_VERSION;
  readonly sourceKind: "DRIVER" | "CONSTRUCTOR";
  readonly selectedContenderId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly snapshotFingerprint: string;
  readonly sourceRelationKind: string;
  readonly definitions: readonly WinningGroupDefinition[];
  readonly behavior: "DISJOINT";
  readonly rawPathCount: "NOT_ENUMERATED";
  readonly obligations: readonly [
    "SOURCE_MEMBERSHIP_AND_LEGALITY_CHECKED_FIRST",
    "POINTS_AHEAD_IFF_SELECTED_POINTS_EXCEED_ALL_RIVALS",
    "COUNTBACK_WIN_IFF_TIED_AT_TOP_AND_STRICTLY_AHEAD_OF_EACH_TIED_RIVAL_BY_M3",
    "STRICT_M3_WIN_IFF_POINTS_AHEAD_OR_COUNTBACK_WIN",
    "POINTS_AHEAD_AND_COUNTBACK_WIN_ARE_MUTUALLY_EXCLUSIVE",
  ];
}

export type WinningGroupResult =
  | { readonly status: "COMPLETE"; readonly groups: readonly WinningGroupDefinition[]; readonly certificate: GroupCertificate }
  | { readonly status: "ELIMINATED"; readonly groups: readonly []; readonly reason: string; readonly proof: object }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "INVALID_SOURCE_RELATION" | "SOURCE_VERSION_MISMATCH" | "UNCERTIFIED_SOURCE"; readonly reason: string };

const genuineWinningGroupResults = new WeakSet<object>();

export function isGenuineWinningGroupResult(value: unknown): value is WinningGroupResult {
  return value !== null && typeof value === "object" && genuineWinningGroupResults.has(value as object);
}

function authenticateGroupResult(result: WinningGroupResult): WinningGroupResult {
  const owned = deepFreeze(result);
  genuineWinningGroupResults.add(owned);
  return owned;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function certificate(kind: "DRIVER" | "CONSTRUCTOR", selected: string, relation: { dataVersion: string; ruleVersion: string; snapshotFingerprint: string; kind: string }): GroupCertificate {
  return deepFreeze({ kind: "ALGEBRAIC_EXECUTABLE_PARTITION_PROOF", groupRuleVersion: WINNING_GROUP_RULE_VERSION, sourceKind: kind,
    selectedContenderId: selected, dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion,
    snapshotFingerprint: relation.snapshotFingerprint, sourceRelationKind: relation.kind, definitions: DEFINITIONS,
    behavior: "DISJOINT", rawPathCount: "NOT_ENUMERATED", obligations: [
      "SOURCE_MEMBERSHIP_AND_LEGALITY_CHECKED_FIRST", "POINTS_AHEAD_IFF_SELECTED_POINTS_EXCEED_ALL_RIVALS",
      "COUNTBACK_WIN_IFF_TIED_AT_TOP_AND_STRICTLY_AHEAD_OF_EACH_TIED_RIVAL_BY_M3",
      "STRICT_M3_WIN_IFF_POINTS_AHEAD_OR_COUNTBACK_WIN", "POINTS_AHEAD_AND_COUNTBACK_WIN_ARE_MUTUALLY_EXCLUSIVE",
    ] });
}

export function groupFrozenDriverRelation(source: FrozenSymbolicResult): WinningGroupResult {
  if (!isGenuineFrozenDriverResult(source)) return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION", reason: "The complete M6 builder result and its evidence are not authentic; no partial groups were returned." });
  if (!source || source.status === "CALCULATION_FAILURE") return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "UNCERTIFIED_SOURCE", reason: "A complete certified driver relation is required; no partial groups were returned." });
  if (source.status === "ELIMINATED") return authenticateGroupResult({ status: "ELIMINATED", groups: [], reason: source.reason, proof: source.proof });
  const { relation, certificate: proof } = source;
  if (!isGenuineFrozenDriverRelation(relation)) return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION", reason: "The driver relation is not an authentic M6 relation; no partial groups were returned." });
  if (proof.kind !== "COMPOSITIONAL_EXACT_RELATION_PROOF" || proof.dataVersion !== relation.dataVersion || proof.ruleVersion !== relation.ruleVersion || proof.snapshotFingerprint !== relation.snapshotFingerprint || proof.approved !== true
    || proof.sessionCount !== relation.eventConstraints.length || proof.rosterSize !== relation.roster.length)
    return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "SOURCE_VERSION_MISMATCH", reason: "The M6 certificate does not bind the supplied relation; no partial groups were returned." });
  return authenticateGroupResult({ status: "COMPLETE", groups: DEFINITIONS, certificate: certificate("DRIVER", relation.selectedDriverId, relation) });
}

export function groupFrozenConstructorRelation(source: ConstructorRelationResult): WinningGroupResult {
  if (!isGenuineFrozenConstructorResult(source)) return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION", reason: "The complete M7 builder result and its evidence are not authentic; no partial groups were returned." });
  if (!source || source.status === "CALCULATION_FAILURE") return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "UNCERTIFIED_SOURCE", reason: "A complete certified constructor relation is required; no partial groups were returned." });
  if (source.status === "ELIMINATED") return authenticateGroupResult({ status: "ELIMINATED", groups: [], reason: source.reason, proof: source.proof });
  const { relation, certificate: proof } = source;
  if (!isGenuineFrozenConstructorRelation(relation)) return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION", reason: "The constructor relation is not an authentic M7 relation; no partial groups were returned." });
  if (proof.kind !== "COMPOSITIONAL_EXACT_CONSTRUCTOR_RELATION_PROOF" || proof.dataVersion !== relation.dataVersion || proof.ruleVersion !== relation.ruleVersion || proof.snapshotFingerprint !== relation.snapshotFingerprint || proof.selectedConstructorId !== relation.selectedConstructorId
    || proof.sessionCount !== relation.eventConstraints.length || proof.rosterSize !== relation.roster.length || proof.constructorCount !== relation.initialStandings.length)
    return authenticateGroupResult({ status: "CALCULATION_FAILURE", code: "SOURCE_VERSION_MISMATCH", reason: "The M7 certificate does not bind the supplied relation; no partial groups were returned." });
  return authenticateGroupResult({ status: "COMPLETE", groups: DEFINITIONS, certificate: certificate("CONSTRUCTOR", relation.selectedConstructorId, relation) });
}

export interface GroupEvidence {
  readonly selected: ChampionshipStanding;
  readonly rivals: readonly ChampionshipStanding[];
  readonly tiedRivalIds: readonly string[];
  readonly comparisons: readonly { readonly rivalId: string; readonly outcome: "ahead" | "behind" | "unresolved"; readonly decidedBy: "points" | "race" | "qualifying" | "equal"; readonly position?: number }[];
}
export type GroupMembership =
  | { readonly status: "MEMBER"; readonly groupId: GroupId; readonly evidence: GroupEvidence }
  | { readonly status: "NOT_MEMBER"; readonly reason: "SOURCE_REJECTED" }
  | { readonly status: "INVALID_PATH"; readonly reason: string };

function classify(standings: readonly ChampionshipStanding[], selectedId: string): GroupMembership {
  const selected = standings.find((item) => item.competitorId === selectedId);
  if (!selected) return { status: "INVALID_PATH", reason: "The selected contender is absent from final standings." };
  const rivals = standings.filter((item) => item.competitorId !== selectedId);
  if (rivals.length === 0) return { status: "NOT_MEMBER", reason: "SOURCE_REJECTED" };
  const comparisons = rivals.map((rival) => ({ rivalId: rival.competitorId, ...compareStandings(selected, rival) }));
  const tiedRivalIds = rivals.filter((rival) => rival.points === selected.points).map((rival) => rival.competitorId);
  const evidence = deepFreeze({ selected, rivals, tiedRivalIds, comparisons });
  if (rivals.every((rival) => selected.points > rival.points)) return { status: "MEMBER", groupId: "POINTS_AHEAD", evidence };
  if (tiedRivalIds.length > 0 && rivals.every((rival) => rival.points <= selected.points)
    && rivals.filter((rival) => rival.points === selected.points).every((rival) => compareStandings(selected, rival).outcome === "ahead"))
    return { status: "MEMBER", groupId: "COUNTBACK_WIN", evidence };
  return { status: "NOT_MEMBER", reason: "SOURCE_REJECTED" };
}

/** Exact M3 final-standings classifier used by the bounded independent checker. */
export function classifyExactFinalStandings(standings: readonly ChampionshipStanding[], selectedId: string): GroupMembership {
  return classify(standings, selectedId);
}

export function classifyFrozenDriverPath(relation: FrozenDriverSymbolicRelation, path: FrozenRawPath): GroupMembership {
  const membership = evaluateFrozenDriverRelation(relation, path);
  if (membership.status === "INVALID_PATH") return { status: "INVALID_PATH", reason: membership.reason };
  if (!membership.accepted) return { status: "NOT_MEMBER", reason: "SOURCE_REJECTED" };
  return classify(membership.finalStandings!, relation.selectedDriverId);
}

export function classifyFrozenConstructorPath(relation: FrozenConstructorSymbolicRelation, path: ConstructorRawPath): GroupMembership {
  const membership = evaluateFrozenConstructorRelation(relation, path);
  if (membership.status === "INVALID_PATH") return { status: "INVALID_PATH", reason: membership.reason };
  if (!membership.accepted) return { status: "NOT_MEMBER", reason: "SOURCE_REJECTED" };
  return classify(membership.finalStandings, relation.selectedConstructorId);
}

export interface AuthenticatedBoundedGroupingFixture {
  readonly kind: "AUTHENTICATED_M4_BOUNDED_GROUP_FIXTURE";
  readonly fingerprint: string;
  readonly question: TinyChampionshipQuestion;
  readonly grouping: "PRODUCTION_PARTITION" | "TEST_OVERLAPPING_ALL_WINS";
}
const genuineBoundedFixtures = new WeakSet<object>();
const genuineBoundedCoverageResults = new WeakSet<object>();

export function isGenuineAuthenticatedBoundedGroupingFixture(value: unknown): value is AuthenticatedBoundedGroupingFixture {
  return value !== null && typeof value === "object" && genuineBoundedFixtures.has(value as object);
}

export function isGenuineBoundedCoverageResult(value: unknown): value is BoundedCoverageResult {
  return value !== null && typeof value === "object" && genuineBoundedCoverageResults.has(value as object);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const character of stable(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `m8-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createAuthenticatedBoundedGroupingFixture(question: TinyChampionshipQuestion, grouping: AuthenticatedBoundedGroupingFixture["grouping"] = "PRODUCTION_PARTITION"): AuthenticatedBoundedGroupingFixture {
  if (!question || typeof question !== "object" || (question.kind !== "driver" && question.kind !== "constructor") || !question.contenderId
    || !Array.isArray(question.futureEvents) || question.futureEvents.length > 2 || question.futureEvents.some((event) => !event.id || !Array.isArray(event.entrants) || event.entrants.length > 4)
    || (grouping !== "PRODUCTION_PARTITION" && grouping !== "TEST_OVERLAPPING_ALL_WINS")) throw new Error("The bounded grouping fixture is malformed or exceeds the M4 boundary.");
  const ownedQuestion = JSON.parse(JSON.stringify(question)) as TinyChampionshipQuestion;
  const artifact = deepFreeze({ kind: "AUTHENTICATED_M4_BOUNDED_GROUP_FIXTURE" as const, fingerprint: fingerprint({ question: ownedQuestion, grouping }), question: ownedQuestion, grouping });
  genuineBoundedFixtures.add(artifact);
  return artifact;
}

export type BoundedCoverageResult =
  | { readonly status: "CERTIFIED"; readonly fixtureFingerprint: string; readonly behavior: "DISJOINT" | "OVERLAPPING"; readonly legalRawPathCount: number; readonly sourceAcceptedCount: number; readonly uniqueGroupUnionCount: number; readonly groupRawIds: Readonly<Record<string, readonly string[]>>; readonly intersections: readonly { readonly left: string; readonly right: string; readonly rawIds: readonly string[] }[] }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "INVALID_ARTIFACT" | "RESOURCE_LIMIT" | "COVERAGE_MISMATCH" | "ILLEGAL_OR_LOSING_INCLUSION"; readonly reason: string; readonly stage?: "INPUT" | "DOMAIN_PREFLIGHT"; readonly eventOutcomeCounts?: readonly number[]; readonly cartesianMaterialized?: false; readonly winningRelationEnumerated?: false };

export type CartesianCountResult =
  | { readonly status: "WITHIN_LIMIT"; readonly count: number }
  | { readonly status: "RESOURCE_LIMIT"; readonly reason: "INVALID_MAXIMUM" | "CAP_EXCEEDED" | "INTEGER_OVERFLOW" };

/** Exact multiplication used before any Cartesian materialization. */
export function calculateCartesianPathCount(eventOutcomeCounts: readonly number[], maximumRawIds: number): CartesianCountResult {
  if (!Number.isSafeInteger(maximumRawIds) || maximumRawIds <= 0) return { status: "RESOURCE_LIMIT", reason: "INVALID_MAXIMUM" };
  let count = 1;
  for (const size of eventOutcomeCounts) {
    if (!Number.isSafeInteger(size) || size < 0 || (size !== 0 && count > Math.floor(Number.MAX_SAFE_INTEGER / size))) return { status: "RESOURCE_LIMIT", reason: "INTEGER_OVERFLOW" };
    count *= size;
    if (count > maximumRawIds) return { status: "RESOURCE_LIMIT", reason: "CAP_EXCEEDED" };
  }
  return { status: "WITHIN_LIMIT", count };
}

function cartesianOutcomePaths(question: TinyChampionshipQuestion): readonly { id: string; events: readonly ReturnType<typeof enumerateEventOutcomes>[number][] }[] {
  let paths: { id: string; events: readonly ReturnType<typeof enumerateEventOutcomes>[number][] }[] = [{ id: "", events: [] }];
  for (const event of question.futureEvents) paths = paths.flatMap((prefix) => enumerateEventOutcomes(event).map((outcome) => ({ id: prefix.id ? `${prefix.id}+${outcome.id}` : outcome.id, events: [...prefix.events, outcome] })));
  return paths;
}

function analyzeBoundedGroupCoverageInternal(artifact: AuthenticatedBoundedGroupingFixture, maximumRawIds: number): BoundedCoverageResult {
  if (!Number.isSafeInteger(maximumRawIds) || maximumRawIds <= 0)
    return { status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT", reason: "maximumRawIds must be a positive safe integer.", stage: "INPUT", eventOutcomeCounts: [], cartesianMaterialized: false, winningRelationEnumerated: false };
  if (!artifact || typeof artifact !== "object" || !genuineBoundedFixtures.has(artifact as object) || artifact.fingerprint !== fingerprint({ question: artifact.question, grouping: artifact.grouping }))
    return { status: "CALCULATION_FAILURE", code: "INVALID_ARTIFACT", reason: "The bounded fixture was not issued by the M8 authenticated fixture builder." };
  const eventDomains = artifact.question.futureEvents.map((event) => enumerateEventOutcomes(event));
  const eventOutcomeCounts = eventDomains.map((domain) => domain.length);
  const countCheck = calculateCartesianPathCount(eventOutcomeCounts, maximumRawIds);
  if (countCheck.status === "RESOURCE_LIMIT") return { status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT", reason: `Cartesian preflight stopped before materialization: ${countCheck.reason}.`, stage: "DOMAIN_PREFLIGHT", eventOutcomeCounts: deepFreeze(eventOutcomeCounts), cartesianMaterialized: false, winningRelationEnumerated: false };
  const legalPaths = cartesianOutcomePaths(artifact.question);
  const wins = enumerateWinningRawOutcomes(artifact.question);
  if (legalPaths.length !== countCheck.count) return { status: "CALCULATION_FAILURE", code: "COVERAGE_MISMATCH", reason: "Materialized legal path count did not equal exact preflight count." };
  const source = new Set(wins.map(({ id }) => id)), legal = new Set(legalPaths.map(({ id }) => id));
  const groupRawIds: Record<string, string[]> = { POINTS_AHEAD: [], COUNTBACK_WIN: [] };
  for (const path of legalPaths) {
    const standings = accumulateTinyPathStandings(artifact.question,path.events);
    const member = classify(standings, artifact.question.contenderId);
    if (member.status === "MEMBER") groupRawIds[member.groupId].push(path.id);
  }
  if (artifact.grouping === "TEST_OVERLAPPING_ALL_WINS") groupRawIds.ALL_WINS = [...source].sort();
  for (const [groupId, ids] of Object.entries(groupRawIds)) for (const id of ids) if (!legal.has(id) || !source.has(id)) return { status: "CALCULATION_FAILURE", code: "ILLEGAL_OR_LOSING_INCLUSION", reason: `Executed predicate ${groupId} included an illegal or losing raw path.` };
  const union = new Set(Object.values(groupRawIds).flat());
  if (source.size !== union.size || [...source].some((id) => !union.has(id))) return { status: "CALCULATION_FAILURE", code: "COVERAGE_MISMATCH", reason: "The exact group union does not equal the source winning relation." };
  const intersections: { left: string; right: string; rawIds: readonly string[] }[] = [];
  const entries = Object.entries(groupRawIds);
  for (let left = 0; left < entries.length; left += 1) for (let right = left + 1; right < entries.length; right += 1) {
    const rightSet = new Set(entries[right][1]);
    const rawIds = entries[left][1].filter((id) => rightSet.has(id)).sort();
    intersections.push(deepFreeze({ left: entries[left][0], right: entries[right][0], rawIds }));
  }
  return deepFreeze({ status: "CERTIFIED", fixtureFingerprint: artifact.fingerprint, behavior: intersections.some((item) => item.rawIds.length > 0) ? "OVERLAPPING" : "DISJOINT", legalRawPathCount: legal.size, sourceAcceptedCount: source.size, uniqueGroupUnionCount: union.size, groupRawIds, intersections });
}

export function analyzeBoundedGroupCoverage(artifact: AuthenticatedBoundedGroupingFixture, maximumRawIds: number): BoundedCoverageResult {
  const result = deepFreeze(analyzeBoundedGroupCoverageInternal(artifact, maximumRawIds));
  genuineBoundedCoverageResults.add(result);
  return result;
}

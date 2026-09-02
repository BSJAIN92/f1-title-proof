import { compareStandings, type ChampionshipStanding } from "../standings/championship-standings";
import {
  classifyExactFinalStandings,
  isGenuineAuthenticatedBoundedGroupingFixture,
  isGenuineBoundedCoverageResult,
  isGenuineWinningGroupResult,
  WINNING_GROUP_RULE_VERSION,
  type AuthenticatedBoundedGroupingFixture,
  type BoundedCoverageResult,
  type WinningGroupResult,
} from "../groups/winning-groups";
import {
  evaluateFrozenDriverRelation,
  isGenuineFrozenDriverResult,
  type FrozenRawPath,
  type FrozenSymbolicResult,
} from "../relations/frozen-driver-symbolic-relation";
import {
  evaluateFrozenConstructorRelation,
  isGenuineFrozenConstructorResult,
  type ConstructorRawPath,
  type ConstructorRelationResult,
} from "../relations/frozen-constructor-symbolic-relation";

export const COMPACT_RULE_TEMPLATE_VERSION = "compact-rule-template-v2";
export const COMPACT_RULE_SEMANTIC_VERSION = "compact-rule-semantics-v2";

export type CompactRuleAst = {
  readonly operation: "OR";
  readonly branches: readonly [
    { readonly operation: "ALL_RIVALS"; readonly test: "SELECTED_POINTS_STRICTLY_GREATER" },
    { readonly operation: "AND"; readonly tests: readonly [
      { readonly operation: "EXISTS_RIVAL"; readonly test: "FINAL_POINTS_EQUAL" },
      { readonly operation: "ALL_RIVALS"; readonly test: "FINAL_POINTS_NOT_GREATER" },
      { readonly operation: "ALL_TIED_RIVALS"; readonly test: "SELECTED_STRICTLY_AHEAD_BY_ORDERED_FINISH_COUNTS"; readonly comparison: readonly [
        { readonly source: "RACE_RESULTS"; readonly order: "WINS_THEN_SECONDS_THEN_THIRDS_AND_SO_ON" },
        { readonly source: "QUALIFYING_RESULTS"; readonly order: "FIRSTS_THEN_SECONDS_THEN_THIRDS_AND_SO_ON"; readonly onlyIfRaceCountsEqual: true },
      ] },
    ] },
  ];
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const AST: CompactRuleAst = deepFreeze({
  operation: "OR",
  branches: [
    { operation: "ALL_RIVALS", test: "SELECTED_POINTS_STRICTLY_GREATER" },
    { operation: "AND", tests: [
      { operation: "EXISTS_RIVAL", test: "FINAL_POINTS_EQUAL" },
      { operation: "ALL_RIVALS", test: "FINAL_POINTS_NOT_GREATER" },
      { operation: "ALL_TIED_RIVALS", test: "SELECTED_STRICTLY_AHEAD_BY_ORDERED_FINISH_COUNTS", comparison: [
        { source: "RACE_RESULTS", order: "WINS_THEN_SECONDS_THEN_THIRDS_AND_SO_ON" },
        { source: "QUALIFYING_RESULTS", order: "FIRSTS_THEN_SECONDS_THEN_THIRDS_AND_SO_ON", onlyIfRaceCountsEqual: true },
      ] },
    ] },
  ],
});

const TEXT = deepFreeze({
  DRIVER: "The driver wins by finishing with more points than every rival. If tied for the most points, the driver must win the tie by having more race wins, then more second places, then more third places, and so on. If every race-result count is equal, qualifying results are compared in the same order.",
  CONSTRUCTOR: "The team wins by finishing with more points than every rival. If tied for the most points, the team must win the tie by having more race wins, then more second places, then more third places, and so on. If every race-result count is equal, qualifying results are compared in the same order.",
} as const);

export interface CompactRule {
  readonly templateVersion: typeof COMPACT_RULE_TEMPLATE_VERSION;
  readonly semanticVersion: typeof COMPACT_RULE_SEMANTIC_VERSION;
  readonly text: string;
  readonly ast: CompactRuleAst;
}

export interface CompactRuleCertificate {
  readonly kind: "ALGEBRAIC_COMPACT_GROUP_SOURCE_EQUIVALENCE_PROOF";
  readonly templateVersion: typeof COMPACT_RULE_TEMPLATE_VERSION;
  readonly semanticVersion: typeof COMPACT_RULE_SEMANTIC_VERSION;
  readonly sourceKind: "DRIVER" | "CONSTRUCTOR";
  readonly selectedContenderId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly snapshotFingerprint: string;
  readonly text: string;
  readonly ast: CompactRuleAst;
  readonly groupRuleVersion: typeof WINNING_GROUP_RULE_VERSION;
  readonly m8SourceResult: WinningGroupResult;
  readonly m8Certificate: Extract<WinningGroupResult, { status: "COMPLETE" }>["certificate"];
  readonly m8Definitions: Extract<WinningGroupResult, { status: "COMPLETE" }>["groups"];
  readonly obligations: readonly [
    "COMPACT_POINTS_BRANCH_IFF_M8_POINTS_AHEAD",
    "COMPACT_TIE_BRANCH_IFF_M8_COUNTBACK_WIN",
    "COMPACT_OR_IFF_M8_GROUP_UNION",
    "M8_GROUP_UNION_IFF_AUTHENTIC_M6_OR_M7_STRICT_MEMBERSHIP",
    "RACE_COUNTS_PRECEDE_QUALIFYING_COUNTS_AND_EXACT_EQUALITY_IS_NOT_A_WIN",
  ];
}

export type OrderedResultLayers = readonly [
  { readonly layer: "COMPACT_RULE"; readonly rule: CompactRule },
  { readonly layer: "DETAILED_GROUPS"; readonly groups: Extract<WinningGroupResult, { status: "COMPLETE" }>["groups"] },
];

export type LayeredWinningResult =
  | { readonly status: "COMPLETE"; readonly layers: OrderedResultLayers; readonly certificate: CompactRuleCertificate }
  | { readonly status: "ELIMINATED"; readonly layers: readonly []; readonly reason: string; readonly proof: object; readonly m8SourceResult: WinningGroupResult | BoundedCoverageResult }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "INVALID_SOURCE" | "INVALID_GROUP_RESULT" | "SOURCE_GROUP_MISMATCH"; readonly reason: string };

type SourceContext =
  | { readonly kind: "DRIVER"; readonly source: Extract<FrozenSymbolicResult, { status: "COMPLETE" }>; readonly groups: Extract<WinningGroupResult, { status: "COMPLETE" }> }
  | { readonly kind: "CONSTRUCTOR"; readonly source: Extract<ConstructorRelationResult, { status: "COMPLETE" }>; readonly groups: Extract<WinningGroupResult, { status: "COMPLETE" }> };

const genuineLayeredResults = new WeakSet<object>();
const genuineCompactCertificates = new WeakSet<object>();
const sourceContexts = new WeakMap<object, SourceContext>();

export function isGenuineLayeredWinningResult(value: unknown): value is LayeredWinningResult {
  if (value === null || typeof value !== "object" || !genuineLayeredResults.has(value as object)) return false;
  const result = value as LayeredWinningResult;
  return result.status !== "COMPLETE" || genuineCompactCertificates.has(result.certificate);
}

function failure(code: Extract<LayeredWinningResult, { status: "CALCULATION_FAILURE" }>["code"], reason: string): LayeredWinningResult {
  return deepFreeze({ status: "CALCULATION_FAILURE", code, reason });
}

function bindComplete(
  kind: "DRIVER" | "CONSTRUCTOR",
  selectedContenderId: string,
  relation: { readonly dataVersion: string; readonly ruleVersion: string; readonly snapshotFingerprint: string },
  groups: Extract<WinningGroupResult, { status: "COMPLETE" }>,
  source: SourceContext["source"],
): LayeredWinningResult {
  if (groups.certificate.sourceKind !== kind || groups.certificate.selectedContenderId !== selectedContenderId
    || groups.certificate.dataVersion !== relation.dataVersion || groups.certificate.ruleVersion !== relation.ruleVersion
    || groups.certificate.snapshotFingerprint !== relation.snapshotFingerprint)
    return failure("SOURCE_GROUP_MISMATCH", "The M8 result does not bind the supplied exact relation; no compact rule was returned.");
  const text = TEXT[kind];
  const rule: CompactRule = deepFreeze({ templateVersion: COMPACT_RULE_TEMPLATE_VERSION, semanticVersion: COMPACT_RULE_SEMANTIC_VERSION, text, ast: AST });
  const certificate: CompactRuleCertificate = deepFreeze({
    kind: "ALGEBRAIC_COMPACT_GROUP_SOURCE_EQUIVALENCE_PROOF", templateVersion: COMPACT_RULE_TEMPLATE_VERSION,
    semanticVersion: COMPACT_RULE_SEMANTIC_VERSION, sourceKind: kind, selectedContenderId,
    dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    text, ast: AST, groupRuleVersion: WINNING_GROUP_RULE_VERSION, m8SourceResult: groups,
    m8Certificate: groups.certificate, m8Definitions: groups.groups,
    obligations: ["COMPACT_POINTS_BRANCH_IFF_M8_POINTS_AHEAD", "COMPACT_TIE_BRANCH_IFF_M8_COUNTBACK_WIN",
      "COMPACT_OR_IFF_M8_GROUP_UNION", "M8_GROUP_UNION_IFF_AUTHENTIC_M6_OR_M7_STRICT_MEMBERSHIP",
      "RACE_COUNTS_PRECEDE_QUALIFYING_COUNTS_AND_EXACT_EQUALITY_IS_NOT_A_WIN"],
  });
  const result = deepFreeze({ status: "COMPLETE" as const, layers: [
    { layer: "COMPACT_RULE" as const, rule }, { layer: "DETAILED_GROUPS" as const, groups: groups.groups },
  ] as const, certificate });
  genuineCompactCertificates.add(certificate);
  genuineLayeredResults.add(result);
  sourceContexts.set(result, { kind, source, groups } as SourceContext);
  return result;
}

function bindEliminated(source: Extract<FrozenSymbolicResult | ConstructorRelationResult, { status: "ELIMINATED" }>, groups: WinningGroupResult): LayeredWinningResult {
  if (groups.status !== "ELIMINATED" || groups.reason !== source.reason || groups.proof !== source.proof)
    return failure("SOURCE_GROUP_MISMATCH", "The M8 elimination does not preserve the exact source proof.");
  const result = deepFreeze({ status: "ELIMINATED" as const, layers: [] as const, reason: source.reason, proof: source.proof, m8SourceResult: groups });
  genuineLayeredResults.add(result);
  return result;
}

export function deriveFrozenDriverLayeredResult(source: FrozenSymbolicResult, groups: WinningGroupResult): LayeredWinningResult {
  if (!isGenuineFrozenDriverResult(source)) return failure("INVALID_SOURCE", "An authentic M6 result is required; no compact rule was returned.");
  if (!isGenuineWinningGroupResult(groups)) return failure("INVALID_GROUP_RESULT", "An authentic M8 result is required; no compact rule was returned.");
  if (source.status === "CALCULATION_FAILURE") return failure("INVALID_SOURCE", "A complete or proven-eliminated M6 result is required.");
  if (source.status === "ELIMINATED") return bindEliminated(source, groups);
  if (groups.status !== "COMPLETE") return failure("SOURCE_GROUP_MISMATCH", "A complete M6 relation requires complete M8 groups.");
  return bindComplete("DRIVER", source.relation.selectedDriverId, source.relation, groups, source);
}

export function deriveFrozenConstructorLayeredResult(source: ConstructorRelationResult, groups: WinningGroupResult): LayeredWinningResult {
  if (!isGenuineFrozenConstructorResult(source)) return failure("INVALID_SOURCE", "An authentic M7 result is required; no compact rule was returned.");
  if (!isGenuineWinningGroupResult(groups)) return failure("INVALID_GROUP_RESULT", "An authentic M8 result is required; no compact rule was returned.");
  if (source.status === "CALCULATION_FAILURE") return failure("INVALID_SOURCE", "A complete or proven-eliminated M7 result is required.");
  if (source.status === "ELIMINATED") return bindEliminated(source, groups);
  if (groups.status !== "COMPLETE") return failure("SOURCE_GROUP_MISMATCH", "A complete M7 relation requires complete M8 groups.");
  return bindComplete("CONSTRUCTOR", source.relation.selectedConstructorId, source.relation, groups, source);
}

/** Test-boundary adapter for an authentic exhaustive M4/M8 empty relation. */
export function deriveBoundedEliminatedLayeredResult(artifact: AuthenticatedBoundedGroupingFixture, coverage: BoundedCoverageResult): LayeredWinningResult {
  if (!isGenuineAuthenticatedBoundedGroupingFixture(artifact) || !isGenuineBoundedCoverageResult(coverage))
    return failure("INVALID_GROUP_RESULT", "Authentic bounded M8 evidence is required.");
  if (coverage.status !== "CERTIFIED" || coverage.fixtureFingerprint !== artifact.fingerprint || coverage.sourceAcceptedCount !== 0 || coverage.uniqueGroupUnionCount !== 0)
    return failure("SOURCE_GROUP_MISMATCH", "The bounded M8 evidence does not prove an empty exact relation.");
  const result = deepFreeze({ status: "ELIMINATED" as const, layers: [] as const, reason: "EXHAUSTIVE_SEARCH_EMPTY", proof: coverage, m8SourceResult: coverage });
  genuineLayeredResults.add(result);
  return result;
}

/** Executes only the closed V1 semantic tree; callers cannot supply prose or a replacement AST. */
export function evaluateCompactRuleStandings(standings: readonly ChampionshipStanding[], selectedId: string): boolean {
  const selected = standings.find(({ competitorId }) => competitorId === selectedId);
  if (!selected) return false;
  const rivals = standings.filter(({ competitorId }) => competitorId !== selectedId);
  if (rivals.length === 0) return false;
  const pointsAhead = rivals.every((rival) => selected.points > rival.points);
  const tied = rivals.filter((rival) => rival.points === selected.points);
  const countbackWin = tied.length > 0 && rivals.every((rival) => rival.points <= selected.points)
    && tied.every((rival) => compareStandings(selected, rival).outcome === "ahead");
  return pointsAhead || countbackWin;
}

export type LayerEquivalenceResult =
  | { readonly status: "EQUIVALENT"; readonly accepted: boolean; readonly compactPredicate: boolean; readonly m8GroupUnion: boolean; readonly exactSourceMembership: boolean }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "INVALID_LAYERED_RESULT" | "INVALID_PATH" | "LAYER_MISMATCH"; readonly reason: string };

function evaluateEquivalence(result: LayeredWinningResult, path: FrozenRawPath | ConstructorRawPath, expectedKind: "DRIVER" | "CONSTRUCTOR"): LayerEquivalenceResult {
  if (!isGenuineLayeredWinningResult(result) || result.status !== "COMPLETE")
    return { status: "CALCULATION_FAILURE", code: "INVALID_LAYERED_RESULT", reason: "An authentic complete compact-rule result is required; no partial layer evaluation was returned." };
  const context = sourceContexts.get(result);
  if (!context || context.kind !== expectedKind || result.layers[0].layer !== "COMPACT_RULE" || result.layers[1].layer !== "DETAILED_GROUPS"
    || result.layers[0].rule.ast !== AST || result.certificate.ast !== AST || result.certificate.text !== result.layers[0].rule.text
    || result.certificate.m8SourceResult !== context.groups)
    return { status: "CALCULATION_FAILURE", code: "INVALID_LAYERED_RESULT", reason: "The compact result provenance or ordered layers are invalid." };
  const exact = context.kind === "DRIVER"
    ? evaluateFrozenDriverRelation(context.source.relation, path as FrozenRawPath)
    : evaluateFrozenConstructorRelation(context.source.relation, path as ConstructorRawPath);
  if (exact.status === "INVALID_PATH")
    return { status: "CALCULATION_FAILURE", code: "INVALID_PATH", reason: exact.reason };
  if (!exact.finalStandings)
    return { status: "CALCULATION_FAILURE", code: "INVALID_PATH", reason: "The full path did not produce final standings." };
  const selected = context.kind === "DRIVER" ? context.source.relation.selectedDriverId : context.source.relation.selectedConstructorId;
  const compactPredicate = evaluateCompactRuleStandings(exact.finalStandings, selected);
  const groupMembership = classifyExactFinalStandings(exact.finalStandings, selected);
  if (groupMembership.status === "INVALID_PATH") return { status: "CALCULATION_FAILURE", code: "INVALID_PATH", reason: groupMembership.reason };
  const m8GroupUnion = groupMembership.status === "MEMBER";
  const exactSourceMembership = exact.accepted;
  if (compactPredicate !== m8GroupUnion || m8GroupUnion !== exactSourceMembership)
    return { status: "CALCULATION_FAILURE", code: "LAYER_MISMATCH", reason: "Compact rule, detailed groups, and exact source relation disagree; no partial result was returned." };
  return deepFreeze({ status: "EQUIVALENT", accepted: exactSourceMembership, compactPredicate, m8GroupUnion, exactSourceMembership });
}

export function evaluateFrozenDriverLayerEquivalence(result: LayeredWinningResult, path: FrozenRawPath): LayerEquivalenceResult {
  return evaluateEquivalence(result, path, "DRIVER");
}

export function evaluateFrozenConstructorLayerEquivalence(result: LayeredWinningResult, path: ConstructorRawPath): LayerEquivalenceResult {
  return evaluateEquivalence(result, path, "CONSTRUCTOR");
}

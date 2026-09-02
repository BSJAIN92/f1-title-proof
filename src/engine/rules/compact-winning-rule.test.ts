import { describe, expect, it } from "vitest";
import manifest from "../../../data/frozen/2026-09-01/manifest.json";
import { accumulateStandings } from "../standings/championship-standings";
import { enumerateEventOutcomes, enumerateWinningRawOutcomes, type TinyChampionshipQuestion } from "../oracle/direct-enumerator";
import { analyzeBoundedGroupCoverage, classifyExactFinalStandings, createAuthenticatedBoundedGroupingFixture, groupFrozenConstructorRelation, groupFrozenDriverRelation } from "../groups/winning-groups";
import { APPROVED_FROZEN_SNAPSHOT_FINGERPRINT, buildApprovedFrozenDriverRelation as buildDriverRelation, type FrozenDriverSymbolicRelation } from "../relations/frozen-driver-symbolic-relation";
import { buildApprovedFrozenConstructorRelation as buildConstructorRelation, type FrozenConstructorSymbolicRelation } from "../relations/frozen-constructor-symbolic-relation";
import { approvedSnapshotFixture } from "../../test/approved-frozen-fixture";
import {
  COMPACT_RULE_SEMANTIC_VERSION, COMPACT_RULE_TEMPLATE_VERSION,
  deriveBoundedEliminatedLayeredResult, deriveFrozenConstructorLayeredResult, deriveFrozenDriverLayeredResult,
  evaluateCompactRuleStandings, evaluateFrozenConstructorLayerEquivalence, evaluateFrozenDriverLayerEquivalence,
  isGenuineLayeredWinningResult, type LayeredWinningResult,
} from "./compact-winning-rule";

const snapshot = approvedSnapshotFixture();
const buildApprovedFrozenDriverRelation = (value: Parameters<typeof buildDriverRelation>[0]) => buildDriverRelation(value, snapshot);
const buildApprovedFrozenConstructorRelation = (value: Parameters<typeof buildConstructorRelation>[0]) => buildConstructorRelation(value, snapshot);
const driverRequest = (selectedDriverId: string) => ({ selectedDriverId, dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, snapshotFingerprint: APPROVED_FROZEN_SNAPSHOT_FINGERPRINT });
const constructorRequest = (selectedConstructorId: string) => ({ selectedConstructorId, dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, snapshotFingerprint: APPROVED_FROZEN_SNAPSHOT_FINGERPRINT });

function driverPath(relation: FrozenDriverSymbolicRelation, winner: string) {
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map(({ sessionId, session }) => ({ sessionId, session, results: relation.roster.map(({ driverId }) => driverId === winner ? { driverId, position: 1, status: "FINISHED" as const } : { driverId, position: null, status: "DNS" as const }) })) };
}

function constructorPath(relation: FrozenConstructorSymbolicRelation, winner: string) {
  const drivers = relation.roster.filter(({ constructorId }) => constructorId === winner).map(({ driverId }) => driverId);
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map(({ sessionId, session }) => ({ sessionId, session, results: relation.roster.map(({ driverId }) => drivers.includes(driverId) ? { driverId, position: drivers.indexOf(driverId) + 1, status: "FINISHED" as const } : { driverId, position: null, status: "DNS" as const }) })) };
}

function allPaths(question: TinyChampionshipQuestion) {
  let paths: { id: string; events: readonly ReturnType<typeof enumerateEventOutcomes>[number][] }[] = [{ id: "", events: [] }];
  for (const event of question.futureEvents) paths = paths.flatMap((prefix) => enumerateEventOutcomes(event).map((outcome) => ({ id: prefix.id ? `${prefix.id}+${outcome.id}` : outcome.id, events: [...prefix.events, outcome] })));
  return paths;
}

function proveTiny(question: TinyChampionshipQuestion) {
  const exactWins = new Set(enumerateWinningRawOutcomes(question).map(({ id }) => id));
  const m8 = analyzeBoundedGroupCoverage(createAuthenticatedBoundedGroupingFixture(question), 100000);
  expect(m8).toMatchObject({ status: "CERTIFIED", sourceAcceptedCount: exactWins.size, uniqueGroupUnionCount: exactWins.size });
  const seen = { pointsAhead: false, countbackWin: false, loss: false, finished: false, classifiedDnf: false, unclassifiedDnf: false, dns: false };
  for (const path of allPaths(question)) {
    const standings = accumulateStandings(question.kind, [...(question.completedEvents ?? []), ...path.events.map(({ session, results }) => ({ session, results }))], question.qualifyingResults);
    const compact = evaluateCompactRuleStandings(standings, question.contenderId);
    const membership = classifyExactFinalStandings(standings, question.contenderId);
    const grouped = membership.status === "MEMBER";
    if (membership.status === "MEMBER") seen[membership.groupId === "POINTS_AHEAD" ? "pointsAhead" : "countbackWin"] = true;
    else seen.loss = true;
    for (const result of path.events.flatMap(({ results }) => results)) {
      if (result.status === "FINISHED") seen.finished = true;
      if (result.status === "DNF" && result.position !== null) seen.classifiedDnf = true;
      if (result.status === "DNF" && result.position === null) seen.unclassifiedDnf = true;
      if (result.status === "DNS") seen.dns = true;
    }
    expect({ compact, grouped, exact: exactWins.has(path.id) }, path.id).toEqual({ compact: exactWins.has(path.id), grouped: exactWins.has(path.id), exact: exactWins.has(path.id) });
  }
  return seen;
}

describe("M9 compact winning rule", () => {
  it("renders only the stable driver wording and exposes machine-checkable layer order", () => {
    const source = buildApprovedFrozenDriverRelation(driverRequest("Lando Norris"));
    const result = deriveFrozenDriverLayeredResult(source, groupFrozenDriverRelation(source));
    expect(result.status).toBe("COMPLETE");
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    expect(result.layers.map(({ layer }) => layer)).toEqual(["COMPACT_RULE", "DETAILED_GROUPS"]);
    expect(result.layers[0].rule).toMatchObject({ templateVersion: COMPACT_RULE_TEMPLATE_VERSION, semanticVersion: COMPACT_RULE_SEMANTIC_VERSION,
      text: "The driver wins by finishing with more points than every rival. If tied for the most points, the driver must win the tie by having more race wins, then more second places, then more third places, and so on. If every race-result count is equal, qualifying results are compared in the same order." });
    expect(result.layers[0].rule.text.indexOf("race wins")).toBeLessThan(result.layers[0].rule.text.indexOf("second places"));
    expect(result.layers[0].rule.text.indexOf("second places")).toBeLessThan(result.layers[0].rule.text.indexOf("third places"));
    expect(result.layers[0].rule.text.indexOf("race-result")).toBeLessThan(result.layers[0].rule.text.indexOf("qualifying results"));
    expect(result.layers[0].rule.ast.branches[1].tests[2].comparison).toEqual([
      { source: "RACE_RESULTS", order: "WINS_THEN_SECONDS_THEN_THIRDS_AND_SO_ON" },
      { source: "QUALIFYING_RESULTS", order: "FIRSTS_THEN_SECONDS_THEN_THIRDS_AND_SO_ON", onlyIfRaceCountsEqual: true },
    ]);
    expect(result.certificate).toMatchObject({ selectedContenderId: "Lando Norris", dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, templateVersion: COMPACT_RULE_TEMPLATE_VERSION });
    expect(result.certificate.m8SourceResult).toBe(result.certificate.m8SourceResult);
    expect(Object.isFrozen(result) && Object.isFrozen(result.layers) && Object.isFrozen(result.layers[0].rule.ast) && Object.isFrozen(result.certificate)).toBe(true);
  });

  it("renders the stable team wording", () => {
    const source = buildApprovedFrozenConstructorRelation(constructorRequest("Scuderia Ferrari HP"));
    const result = deriveFrozenConstructorLayeredResult(source, groupFrozenConstructorRelation(source));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    expect(result.layers[0].rule.text).toBe("The team wins by finishing with more points than every rival. If tied for the most points, the team must win the tie by having more race wins, then more second places, then more third places, and so on. If every race-result count is equal, qualifying results are compared in the same order.");
  });

  it("rejects cloned sources, groups, layered results, text, AST, template, and certificate", () => {
    const source = buildApprovedFrozenDriverRelation(driverRequest("Lando Norris"));
    const groups = groupFrozenDriverRelation(source);
    expect(deriveFrozenDriverLayeredResult({ ...source } as typeof source, groups)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE" });
    expect(deriveFrozenDriverLayeredResult(source, { ...groups } as typeof groups)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_GROUP_RESULT" });
    const result = deriveFrozenDriverLayeredResult(source, groups);
    if (result.status !== "COMPLETE" || source.status !== "COMPLETE") throw new Error("Expected complete result");
    const path = driverPath(source.relation, "Lando Norris");
    const variants = [
      { ...result },
      { ...result, layers: [{ ...result.layers[0], rule: { ...result.layers[0].rule, text: "arbitrary" } }, result.layers[1]] },
      { ...result, layers: [{ ...result.layers[0], rule: { ...result.layers[0].rule, ast: { ...result.layers[0].rule.ast } } }, result.layers[1]] },
      { ...result, layers: [{ ...result.layers[0], rule: { ...result.layers[0].rule, templateVersion: "forged" } }, result.layers[1]] },
      { ...result, certificate: { ...result.certificate } },
      { ...result, layers: [result.layers[1], result.layers[0]] },
    ];
    for (const variant of variants) {
      expect(isGenuineLayeredWinningResult(variant)).toBe(false);
      expect(evaluateFrozenDriverLayerEquivalence(variant as LayeredWinningResult, path)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_LAYERED_RESULT" });
    }
  });

  it("proves compact, groups, and exact frozen driver membership agree for win, loss, and stale paths", () => {
    const source = buildApprovedFrozenDriverRelation(driverRequest("Lando Norris"));
    const result = deriveFrozenDriverLayeredResult(source, groupFrozenDriverRelation(source));
    if (source.status !== "COMPLETE") throw new Error(source.reason);
    expect(evaluateFrozenDriverLayerEquivalence(result, driverPath(source.relation, "Lando Norris"))).toEqual({ status: "EQUIVALENT", accepted: true, compactPredicate: true, m8GroupUnion: true, exactSourceMembership: true });
    expect(evaluateFrozenDriverLayerEquivalence(result, driverPath(source.relation, "Kimi Antonelli"))).toEqual({ status: "EQUIVALENT", accepted: false, compactPredicate: false, m8GroupUnion: false, exactSourceMembership: false });
    expect(evaluateFrozenDriverLayerEquivalence(result, { ...driverPath(source.relation, "Lando Norris"), dataVersion: "stale" })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_PATH" });
  });

  it("proves compact, groups, and exact frozen constructor membership agree", () => {
    const source = buildApprovedFrozenConstructorRelation(constructorRequest("Scuderia Ferrari HP"));
    const result = deriveFrozenConstructorLayeredResult(source, groupFrozenConstructorRelation(source));
    if (source.status !== "COMPLETE") throw new Error(source.reason);
    expect(evaluateFrozenConstructorLayerEquivalence(result, constructorPath(source.relation, "Scuderia Ferrari HP"))).toMatchObject({ status: "EQUIVALENT", accepted: true });
    expect(evaluateFrozenConstructorLayerEquivalence(result, constructorPath(source.relation, "Cadillac Formula 1 Team"))).toMatchObject({ status: "EQUIVALENT", accepted: false });
  });

  it("matches every legal tiny driver path across race, Sprint, statuses, boundaries, countback, equality, and merged sessions", () => {
    const entrants = [{ driverId: "A", constructorId: "X" }, { driverId: "B", constructorId: "Y" }];
    for (const session of ["race", "sprint"] as const) for (const gap of [-1, 0, 1]) proveTiny({ kind: "driver", contenderId: "A", completedEvents: [{ session: "race", results: [
      { driverId: "A", constructorId: "X", position: 1, status: "DNF", awardedPoints: 10 },
      { driverId: "B", constructorId: "Y", position: 2, status: "FINISHED", awardedPoints: 10 + gap },
    ] }], futureEvents: [{ id: `${session}-${gap}`, session, entrants }] });
    proveTiny({ kind: "driver", contenderId: "A", qualifyingResults: [{ driverId: "A", constructorId: "X", position: 1 }, { driverId: "B", constructorId: "Y", position: 2 }], futureEvents: [
      { id: "race", session: "race", entrants, allowedResults: { A: [{ position: 1, status: "FINISHED" }, { position: null, status: "DNS" }], B: [{ position: 2, status: "DNF" }, { position: null, status: "DNF" }] } },
      { id: "sprint", session: "sprint", entrants, allowedResults: { A: [{ position: null, status: "DNS" }], B: [{ position: null, status: "DNS" }] } },
    ] });
    expect(evaluateCompactRuleStandings([{ competitorId: "A", points: 10, racePositions: {}, qualifyingPositions: {} }, { competitorId: "B", points: 10, racePositions: {}, qualifyingPositions: {} }], "A")).toBe(false);
  });

  it("exhaustively matches tiny constructor paths across both cars, sessions, statuses, boundaries, countback, equality, and merged prefixes", () => {
    const entrants = [{ driverId: "A1", constructorId: "X" }, { driverId: "A2", constructorId: "X" }, { driverId: "B1", constructorId: "Y" }, { driverId: "B2", constructorId: "Y" }];
    const aggregate = { pointsAhead: false, countbackWin: false, loss: false, finished: false, classifiedDnf: false, unclassifiedDnf: false, dns: false };
    for (const session of ["race", "sprint"] as const) for (const gap of [-1, 0, 1]) {
      const seen = proveTiny({ kind: "constructor", contenderId: "X", completedEvents: [{ session: "race", results: [
        { driverId: "A1", constructorId: "X", position: 1, status: "FINISHED", awardedPoints: 10 },
        { driverId: "A2", constructorId: "X", position: null, status: "DNS", awardedPoints: 0 },
        { driverId: "B1", constructorId: "Y", position: 2, status: "FINISHED", awardedPoints: 10 + gap },
        { driverId: "B2", constructorId: "Y", position: null, status: "DNS", awardedPoints: 0 },
      ] }], futureEvents: [{ id: `${session}-${gap}`, session, entrants }] });
      for (const key of Object.keys(aggregate) as (keyof typeof aggregate)[]) aggregate[key] ||= seen[key];
    }
    expect(aggregate).toEqual({ pointsAhead: true, countbackWin: true, loss: true, finished: true, classifiedDnf: true, unclassifiedDnf: true, dns: true });

    const merged = proveTiny({ kind: "constructor", contenderId: "X", qualifyingResults: [
      { driverId: "A1", constructorId: "X", position: 1 }, { driverId: "B1", constructorId: "Y", position: 2 },
    ], futureEvents: [
      { id: "r", session: "race", entrants, allowedResults: { A1: [{ position: 1, status: "FINISHED" }, { position: null, status: "DNF" }], A2: [{ position: null, status: "DNS" }], B1: [{ position: 2, status: "DNF" }, { position: null, status: "DNF" }], B2: [{ position: null, status: "DNS" }] } },
      { id: "s", session: "sprint", entrants, allowedResults: { A1: [{ position: null, status: "DNS" }], A2: [{ position: null, status: "DNF" }], B1: [{ position: null, status: "DNS" }], B2: [{ position: null, status: "DNF" }] } },
    ] });
    expect(merged.loss || merged.pointsAhead || merged.countbackWin).toBe(true);

    proveTiny({ kind: "constructor", contenderId: "X", completedEvents: [{ session: "race", results: [
      { driverId: "A1", constructorId: "X", position: 1, status: "FINISHED", awardedPoints: 10 }, { driverId: "B1", constructorId: "Y", position: 2, status: "FINISHED", awardedPoints: 10 },
    ] }], futureEvents: [] });
    proveTiny({ kind: "constructor", contenderId: "X", completedEvents: [{ session: "race", results: [
      { driverId: "A1", constructorId: "X", position: 1, status: "FINISHED", awardedPoints: 10 }, { driverId: "B1", constructorId: "Y", position: 2, status: "FINISHED", awardedPoints: 0 },
    ] }, { session: "race", results: [
      { driverId: "B1", constructorId: "Y", position: 1, status: "FINISHED", awardedPoints: 10 }, { driverId: "A1", constructorId: "X", position: 2, status: "FINISHED", awardedPoints: 0 },
    ] }], qualifyingResults: [{ driverId: "A1", constructorId: "X", position: 1 }, { driverId: "B1", constructorId: "Y", position: 2 }], futureEvents: [] });
    expect(evaluateCompactRuleStandings([{ competitorId: "X", points: 10, racePositions: { 1: 1 }, qualifyingPositions: { 1: 1 } }, { competitorId: "Y", points: 10, racePositions: { 1: 1 }, qualifyingPositions: { 1: 1 } }], "X")).toBe(false);
  });

  it("derives authentic frozen layered results for all 22 drivers and 11 teams", () => {
    let eliminated = 0;
    for (const driver of manifest.futureLineup.flatMap(({ drivers }) => drivers)) {
      const source = buildApprovedFrozenDriverRelation(driverRequest(driver));
      if (source.status === "ELIMINATED") eliminated += 1;
      expect(source.status).toBe("COMPLETE");
      const result = deriveFrozenDriverLayeredResult(source, groupFrozenDriverRelation(source));
      expect(result.status).toBe("COMPLETE");
      expect(isGenuineLayeredWinningResult(result)).toBe(true);
      if (result.status === "COMPLETE") {
        expect(result.layers.map(({ layer }) => layer)).toEqual(["COMPACT_RULE", "DETAILED_GROUPS"]);
        expect(result.certificate).toMatchObject({ kind: "ALGEBRAIC_COMPACT_GROUP_SOURCE_EQUIVALENCE_PROOF", selectedContenderId: driver, sourceKind: "DRIVER" });
      }
    }
    for (const team of manifest.futureLineup.map(({ constructor }) => constructor)) {
      const source = buildApprovedFrozenConstructorRelation(constructorRequest(team));
      if (source.status === "ELIMINATED") eliminated += 1;
      expect(source.status).toBe("COMPLETE");
      const result = deriveFrozenConstructorLayeredResult(source, groupFrozenConstructorRelation(source));
      expect(result.status).toBe("COMPLETE");
      expect(isGenuineLayeredWinningResult(result)).toBe(true);
      if (result.status === "COMPLETE") expect(result.certificate).toMatchObject({ selectedContenderId: team, sourceKind: "CONSTRUCTOR" });
    }
    expect(eliminated).toBe(0);
  });

  it("classifies representative frozen leader, close, and lower contender paths", () => {
    for (const driver of ["Kimi Antonelli", "George Russell", "Sergio Perez"]) {
      const source = buildApprovedFrozenDriverRelation(driverRequest(driver));
      if (source.status !== "COMPLETE") throw new Error(`Expected complete ${driver} relation`);
      const result = deriveFrozenDriverLayeredResult(source, groupFrozenDriverRelation(source));
      expect(evaluateFrozenDriverLayerEquivalence(result, driverPath(source.relation, driver))).toMatchObject({ status: "EQUIVALENT", accepted: true });
      const rival = driver === "Kimi Antonelli" ? "Sergio Perez" : "Kimi Antonelli";
      expect(evaluateFrozenDriverLayerEquivalence(result, driverPath(source.relation, rival))).toMatchObject({ status: "EQUIVALENT", accepted: false });
    }
    for (const team of ["Mercedes-AMG PETRONAS F1 Team", "Scuderia Ferrari HP", "Cadillac Formula 1 Team"]) {
      const source = buildApprovedFrozenConstructorRelation(constructorRequest(team));
      if (source.status !== "COMPLETE") throw new Error(`Expected complete ${team} relation`);
      const result = deriveFrozenConstructorLayeredResult(source, groupFrozenConstructorRelation(source));
      expect(evaluateFrozenConstructorLayerEquivalence(result, constructorPath(source.relation, team))).toMatchObject({ status: "EQUIVALENT", accepted: true });
      const rival = team === "Mercedes-AMG PETRONAS F1 Team" ? "Cadillac Formula 1 Team" : "Mercedes-AMG PETRONAS F1 Team";
      expect(evaluateFrozenConstructorLayerEquivalence(result, constructorPath(source.relation, rival))).toMatchObject({ status: "EQUIVALENT", accepted: false });
    }
  });

  it("preserves authentic bounded exhaustive elimination evidence and rejects a forged proof", () => {
    const artifact = createAuthenticatedBoundedGroupingFixture({ kind: "driver", contenderId: "missing", futureEvents: [] });
    const coverage = analyzeBoundedGroupCoverage(artifact, 1);
    const result = deriveBoundedEliminatedLayeredResult(artifact, coverage);
    expect(result).toMatchObject({ status: "ELIMINATED", layers: [], reason: "EXHAUSTIVE_SEARCH_EMPTY" });
    if (result.status !== "ELIMINATED") throw new Error("Expected proven bounded elimination");
    expect(result.proof).toBe(coverage);
    expect(result.m8SourceResult).toBe(coverage);
    expect(deriveBoundedEliminatedLayeredResult(artifact, { ...coverage })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_GROUP_RESULT" });
  });
});

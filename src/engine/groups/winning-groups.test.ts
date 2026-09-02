import { describe, expect, it } from "vitest";
import manifest from "../../../data/frozen/2026-09-01/manifest.json";
import { accumulateStandings } from "../standings/championship-standings";
import { enumerateWinningRawOutcomes, type TinyChampionshipQuestion } from "../oracle/direct-enumerator";
import { APPROVED_FROZEN_SNAPSHOT_FINGERPRINT, buildApprovedFrozenDriverRelation as buildDriverRelation, type FrozenDriverSymbolicRelation } from "../relations/frozen-driver-symbolic-relation";
import { buildApprovedFrozenConstructorRelation as buildConstructorRelation, type FrozenConstructorSymbolicRelation } from "../relations/frozen-constructor-symbolic-relation";
import { approvedSnapshotFixture } from "../../test/approved-frozen-fixture";
import { analyzeBoundedGroupCoverage, calculateCartesianPathCount, classifyExactFinalStandings, classifyFrozenConstructorPath, classifyFrozenDriverPath, createAuthenticatedBoundedGroupingFixture, groupFrozenConstructorRelation, groupFrozenDriverRelation, type AuthenticatedBoundedGroupingFixture } from "./winning-groups";

const snapshot = approvedSnapshotFixture();
const buildApprovedFrozenDriverRelation = (value: Parameters<typeof buildDriverRelation>[0]) => buildDriverRelation(value, snapshot);
const buildApprovedFrozenConstructorRelation = (value: Parameters<typeof buildConstructorRelation>[0]) => buildConstructorRelation(value, snapshot);
const driverRequest = (selectedDriverId: string) => ({ selectedDriverId, dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, snapshotFingerprint: APPROVED_FROZEN_SNAPSHOT_FINGERPRINT });
const constructorRequest = (selectedConstructorId: string) => ({ selectedConstructorId, dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, snapshotFingerprint: APPROVED_FROZEN_SNAPSHOT_FINGERPRINT });
const entrants = [{ driverId: "A", constructorId: "X" }, { driverId: "B", constructorId: "Y" }];

function independentlyGroup(question: TinyChampionshipQuestion) {
  const wins = enumerateWinningRawOutcomes(question);
  const groups = { POINTS_AHEAD: [] as string[], COUNTBACK_WIN: [] as string[] };
  for (const win of wins) {
    const standings = accumulateStandings(question.kind, [...(question.completedEvents ?? []), ...win.events.map(({ session, results }) => ({ session, results }))], question.qualifyingResults);
    const classified = classifyExactFinalStandings(standings, question.contenderId);
    if (classified.status !== "MEMBER") throw new Error(`Winning raw ID was not grouped: ${win.id}`);
    groups[classified.groupId].push(win.id);
  }
  return { wins, groups, coverage: analyzeBoundedGroupCoverage(createAuthenticatedBoundedGroupingFixture(question), 100000) };
}

function driverPath(relation: FrozenDriverSymbolicRelation, winner: string) {
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map(({ sessionId, session }) => ({ sessionId, session, results: relation.roster.map(({ driverId }) => driverId === winner ? { driverId, position: 1, status: "FINISHED" as const } : { driverId, position: null, status: "DNS" as const }) })) };
}
function constructorPath(relation: FrozenConstructorSymbolicRelation, winner: string) {
  const drivers = relation.roster.filter(({ constructorId }) => constructorId === winner).map(({ driverId }) => driverId);
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map(({ sessionId, session }) => ({ sessionId, session, results: relation.roster.map(({ driverId }) => drivers.includes(driverId) ? { driverId, position: drivers.indexOf(driverId) + 1, status: "FINISHED" as const } : { driverId, position: null, status: "DNS" as const }) })) };
}

describe("M8 exact winning groups", () => {
  it("partitions tiny race and Sprint driver wins exactly, including statuses and below/at/above the points threshold", () => {
    for (const session of ["race", "sprint"] as const) {
      for (const gap of [-1, 0, 1]) {
        const completed = { session: "race" as const, results: [
          { driverId: "A", constructorId: "X", position: 1, status: "FINISHED" as const, awardedPoints: 10 },
          { driverId: "B", constructorId: "Y", position: 2, status: "DNF" as const, awardedPoints: 10 + gap },
        ] };
        const result = independentlyGroup({ kind: "driver", contenderId: "A", completedEvents: [completed], futureEvents: [{ id: `e-${session}-${gap}`, session, entrants }] });
        expect(result.coverage).toMatchObject({ status: "CERTIFIED", behavior: "DISJOINT", sourceAcceptedCount: result.wins.length, uniqueGroupUnionCount: result.wins.length });
      }
    }
  });

  it("partitions tiny constructor wins with both cars, multiple sessions, race countback, qualifying fallback, and unresolved equality", () => {
    const four = [{ driverId: "A1", constructorId: "X" }, { driverId: "A2", constructorId: "X" }, { driverId: "B1", constructorId: "Y" }, { driverId: "B2", constructorId: "Y" }];
    const result = independentlyGroup({ kind: "constructor", contenderId: "X", qualifyingResults: [
      { driverId: "A1", constructorId: "X", position: 1 }, { driverId: "B1", constructorId: "Y", position: 2 },
    ], futureEvents: [{ id: "r", session: "race", entrants: four, allowedResults: { A1: [{ position: 1, status: "FINISHED" }], B1: [{ position: 2, status: "FINISHED" }] } },
    { id: "s", session: "sprint", entrants: four, allowedResults: { A1: [{ position: null, status: "DNS" }], B1: [{ position: null, status: "DNF" }] } }] });
    expect(result.coverage).toMatchObject({ status: "CERTIFIED", behavior: "DISJOINT" });
    expect(result.groups.COUNTBACK_WIN.length + result.groups.POINTS_AHEAD.length).toBe(result.wins.length);
    expect(classifyExactFinalStandings([{ competitorId: "X", points: 10, racePositions: {}, qualifyingPositions: {} }, { competitorId: "Y", points: 10, racePositions: {}, qualifyingPositions: {} }], "X")).toMatchObject({ status: "NOT_MEMBER" });
  });

  it("labels deliberate valid overlap and de-duplicates its union", () => {
    const artifact = createAuthenticatedBoundedGroupingFixture({ kind: "driver", contenderId: "A", futureEvents: [{ id: "overlap", session: "race", entrants }] }, "TEST_OVERLAPPING_ALL_WINS");
    const result = analyzeBoundedGroupCoverage(artifact, 1000);
    expect(result).toMatchObject({ status: "CERTIFIED", behavior: "OVERLAPPING" });
    if (result.status === "CERTIFIED") expect(result.uniqueGroupUnionCount).toBe(result.sourceAcceptedCount);
  });

  it("certifies an exact empty relation without inventing scenarios", () => {
    const artifact = createAuthenticatedBoundedGroupingFixture({ kind: "driver", contenderId: "missing", futureEvents: [] });
    expect(analyzeBoundedGroupCoverage(artifact, 2)).toMatchObject({
      status: "CERTIFIED", behavior: "DISJOINT", sourceAcceptedCount: 0, uniqueGroupUnionCount: 0,
    });
  });

  it("separates race-countback and qualifying-fallback wins from unresolved equality", () => {
    expect(classifyExactFinalStandings([
      { competitorId: "A", points: 10, racePositions: { 1: 1 }, qualifyingPositions: {} },
      { competitorId: "B", points: 10, racePositions: { 2: 1 }, qualifyingPositions: {} },
    ], "A")).toMatchObject({ status: "MEMBER", groupId: "COUNTBACK_WIN" });
    expect(classifyExactFinalStandings([
      { competitorId: "A", points: 10, racePositions: { 1: 1 }, qualifyingPositions: { 1: 1 } },
      { competitorId: "B", points: 10, racePositions: { 1: 1 }, qualifyingPositions: { 2: 1 } },
    ], "A")).toMatchObject({ status: "MEMBER", groupId: "COUNTBACK_WIN" });
    expect(classifyExactFinalStandings([
      { competitorId: "A", points: 10, racePositions: {}, qualifyingPositions: {} },
      { competitorId: "B", points: 10, racePositions: {}, qualifyingPositions: {} },
    ], "A")).toMatchObject({ status: "NOT_MEMBER" });
  });

  it("rejects fabricated artifacts and unsafe enumeration sizes", () => {
    const real = createAuthenticatedBoundedGroupingFixture({ kind: "driver", contenderId: "A", futureEvents: [{ id: "auth", session: "race", entrants }] });
    expect(analyzeBoundedGroupCoverage({ ...real } as AuthenticatedBoundedGroupingFixture, 1000)).toMatchObject({ code: "INVALID_ARTIFACT" });
    expect(analyzeBoundedGroupCoverage(real, 1)).toMatchObject({ code: "RESOURCE_LIMIT" });
  });

  it("rejects a four-driver two-event Cartesian product during preflight", () => {
    const four = [{ driverId: "A1", constructorId: "X" }, { driverId: "A2", constructorId: "X" }, { driverId: "B1", constructorId: "Y" }, { driverId: "B2", constructorId: "Y" }];
    const artifact = createAuthenticatedBoundedGroupingFixture({ kind: "constructor", contenderId: "X", futureEvents: [
      { id: "large-race", session: "race", entrants: four }, { id: "large-sprint", session: "sprint", entrants: four },
    ] });
    expect(analyzeBoundedGroupCoverage(artifact, 10)).toMatchObject({ status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT", stage: "DOMAIN_PREFLIGHT", cartesianMaterialized: false, winningRelationEnumerated: false });
    const result = analyzeBoundedGroupCoverage(artifact, 10);
    if (result.status !== "CALCULATION_FAILURE") throw new Error("Expected preflight failure");
    expect(result.eventOutcomeCounts?.length).toBe(2);
    expect(result.eventOutcomeCounts?.every((count) => count > 10)).toBe(true);
  });

  it("rejects invalid maxima and detects safe-integer multiplication overflow", () => {
    const artifact = createAuthenticatedBoundedGroupingFixture({ kind: "driver", contenderId: "A", futureEvents: [] });
    expect(analyzeBoundedGroupCoverage(artifact, 0)).toMatchObject({ code: "RESOURCE_LIMIT", stage: "INPUT", cartesianMaterialized: false, winningRelationEnumerated: false });
    expect(analyzeBoundedGroupCoverage(artifact, Number.MAX_SAFE_INTEGER + 1)).toMatchObject({ code: "RESOURCE_LIMIT", stage: "INPUT" });
    expect(calculateCartesianPathCount([Number.MAX_SAFE_INTEGER, 2], Number.MAX_SAFE_INTEGER)).toEqual({ status: "RESOURCE_LIMIT", reason: "INTEGER_OVERFLOW" });
  });

  it("groups all frozen complete drivers and constructors with bound algebraic certificates", () => {
    for (const driver of manifest.futureLineup.flatMap(({ drivers }) => drivers)) {
      const source = buildApprovedFrozenDriverRelation(driverRequest(driver));
      const grouped = groupFrozenDriverRelation(source);
      expect(grouped.status).toBe(source.status === "COMPLETE" ? "COMPLETE" : "ELIMINATED");
      if (grouped.status === "COMPLETE") expect(grouped.certificate).toMatchObject({ behavior: "DISJOINT", sourceKind: "DRIVER", rawPathCount: "NOT_ENUMERATED" });
    }
    for (const team of manifest.futureLineup.map(({ constructor }) => constructor)) {
      const source = buildApprovedFrozenConstructorRelation(constructorRequest(team));
      const grouped = groupFrozenConstructorRelation(source);
      expect(grouped.status).toBe(source.status === "COMPLETE" ? "COMPLETE" : "ELIMINATED");
    }
  });

  it("classifies frozen points-ahead win/loss witnesses and rejects stale and forged relations", () => {
    const driver = buildApprovedFrozenDriverRelation(driverRequest("Lando Norris"));
    if (driver.status !== "COMPLETE") throw new Error(driver.reason);
    expect(classifyFrozenDriverPath(driver.relation, driverPath(driver.relation, "Lando Norris"))).toMatchObject({ status: "MEMBER", groupId: "POINTS_AHEAD" });
    expect(classifyFrozenDriverPath(driver.relation, driverPath(driver.relation, "Kimi Antonelli"))).toMatchObject({ status: "NOT_MEMBER" });
    const stale = { ...driverPath(driver.relation, "Lando Norris"), ruleVersion: "stale" };
    expect(classifyFrozenDriverPath(driver.relation, stale)).toMatchObject({ status: "INVALID_PATH" });
    expect(groupFrozenDriverRelation({ ...driver, relation: { ...driver.relation } as FrozenDriverSymbolicRelation })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
    expect(groupFrozenDriverRelation({ ...driver } as typeof driver)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
    expect(groupFrozenDriverRelation({ ...driver, certificate: { ...driver.certificate } } as typeof driver)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
    expect(groupFrozenDriverRelation({ status: "ELIMINATED", reason: "MATHEMATICAL_CEILING", proof: { pruned: true, rule: "STRICT_POINTS_CEILING", evidence: {} } } as never)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });

    const team = buildApprovedFrozenConstructorRelation(constructorRequest("Scuderia Ferrari HP"));
    if (team.status !== "COMPLETE") throw new Error(team.reason);
    expect(classifyFrozenConstructorPath(team.relation, constructorPath(team.relation, "Scuderia Ferrari HP"))).toMatchObject({ status: "MEMBER", groupId: "POINTS_AHEAD" });
    expect(groupFrozenConstructorRelation({ ...team, relation: { ...team.relation } as FrozenConstructorSymbolicRelation })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
    expect(groupFrozenConstructorRelation({ ...team } as typeof team)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
    expect(groupFrozenConstructorRelation({ ...team, certificate: { ...team.certificate } } as typeof team)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
    expect(groupFrozenConstructorRelation({ status: "ELIMINATED", reason: "MATHEMATICAL_CEILING", proof: { pruned: true, rule: "STRICT_POINTS_CEILING", evidence: {} } } as never)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SOURCE_RELATION" });
  });
});

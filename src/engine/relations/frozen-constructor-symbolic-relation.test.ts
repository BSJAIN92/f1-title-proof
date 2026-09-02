import { describe, expect, it } from "vitest";
import manifest from "../../../data/frozen/2026-09-01/manifest.json";
import { APPROVED_FROZEN_SNAPSHOT_FINGERPRINT } from "./frozen-driver-symbolic-relation";
import { buildApprovedFrozenConstructorRelation as buildConstructorRelation, evaluateFrozenConstructorRelation, type FrozenConstructorSymbolicRelation } from "./frozen-constructor-symbolic-relation";
import { approvedSnapshotFixture } from "../../test/approved-frozen-fixture";

const snapshot = approvedSnapshotFixture();
const buildApprovedFrozenConstructorRelation = (value: Parameters<typeof buildConstructorRelation>[0]) => buildConstructorRelation(value, snapshot);
const request = (selectedConstructorId: string) => ({ selectedConstructorId, dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, snapshotFingerprint: APPROVED_FROZEN_SNAPSHOT_FINGERPRINT });
function path(relation: FrozenConstructorSymbolicRelation, winningTeam: string) {
  const winners = new Set(relation.roster.filter(({ constructorId }) => constructorId === winningTeam).map(({ driverId }) => driverId));
  const winnerOrder = [...winners];
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map(({ sessionId, session }) => ({ sessionId, session, results: relation.roster.map(({ driverId }) => winners.has(driverId)
      ? { driverId, position: winnerOrder.indexOf(driverId) + 1, status: "FINISHED" as const } : { driverId, position: null, status: "DNS" as const }) })) };
}

describe("approved frozen constructor symbolic relation", () => {
  it("constructs for all 11 constructors and independently matches the 488-point ceiling", () => {
    const teams = manifest.futureLineup.map(({ constructor }) => constructor), points = new Map(manifest.constructorStandings.map(({ constructor, points }) => [constructor, points]));
    const leader = Math.max(...teams.map((team) => points.get(team)!));
    const maximum = manifest.remainingSessions.reduce((sum, session) => sum + (session.type === "race" ? 43 : 15), 0);
    expect(maximum).toBe(488);
    for (const team of teams) expect(buildApprovedFrozenConstructorRelation(request(team)).status).toBe(points.get(team)! + maximum < leader ? "ELIMINATED" : "COMPLETE");
  });

  it.each(["Mercedes-AMG PETRONAS F1 Team", "Scuderia Ferrari HP", "Cadillac Formula 1 Team"])("classifies full-length both-car win and loss paths for %s", (team) => {
    const result = buildApprovedFrozenConstructorRelation(request(team));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    const rival = team === "Mercedes-AMG PETRONAS F1 Team" ? "Scuderia Ferrari HP" : "Mercedes-AMG PETRONAS F1 Team";
    expect(evaluateFrozenConstructorRelation(result.relation, path(result.relation, team))).toMatchObject({ status: "VALID", accepted: true });
    expect(evaluateFrozenConstructorRelation(result.relation, path(result.relation, rival))).toMatchObject({ status: "VALID", accepted: false });
  });

  it("binds 22 regular drivers, 11 teams, 12 sessions, and both-car constraints", () => {
    const result = buildApprovedFrozenConstructorRelation(request("Mercedes-AMG PETRONAS F1 Team"));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    expect(result.certificate).toMatchObject({ rosterSize: 22, constructorCount: 11, sessionCount: 12 });
    expect(result.relation.eventConstraints.every(({ driverAssignments }) => driverAssignments.length === 22)).toBe(true);
    expect(result.relation.finalPredicate).toMatchObject({ bothCarsScore: true, sprintCountbackExcluded: true, unresolvedEqualityIsWin: false });
  });

  it("rejects stale, missing, reordered, and illegal paths", () => {
    const result = buildApprovedFrozenConstructorRelation(request("Scuderia Ferrari HP"));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    const legal = path(result.relation, "Scuderia Ferrari HP");
    expect(evaluateFrozenConstructorRelation(result.relation, { ...legal, ruleVersion: "stale" })).toMatchObject({ status: "INVALID_PATH", code: "VERSION_MISMATCH" });
    expect(evaluateFrozenConstructorRelation(result.relation, { ...legal, sessions: legal.sessions.slice(1) })).toMatchObject({ status: "INVALID_PATH", code: "SESSION_MISMATCH" });
    expect(evaluateFrozenConstructorRelation(result.relation, { ...legal, sessions: [legal.sessions[1], legal.sessions[0], ...legal.sessions.slice(2)] })).toMatchObject({ status: "INVALID_PATH", code: "SESSION_MISMATCH" });
    const bad = { ...legal.sessions[0], results: legal.sessions[0].results.slice(1) };
    expect(evaluateFrozenConstructorRelation(result.relation, { ...legal, sessions: [bad, ...legal.sessions.slice(1)] })).toMatchObject({ status: "INVALID_PATH", code: "ILLEGAL_EVENT" });
  });

  it("deep-freezes genuine relations and rejects forged or malformed runtime inputs", () => {
    const result = buildApprovedFrozenConstructorRelation(request("Scuderia Ferrari HP"));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    expect(Object.isFrozen(result.relation.roster[0])).toBe(true);
    expect(Object.isFrozen(result.relation.initialStandings[0].racePositions)).toBe(true);
    expect(Object.isFrozen(result.relation.eventConstraints[0].driverAssignments[0])).toBe(true);
    expect(() => ((result.relation.roster[0] as { constructorId: string }).constructorId = "forged")).toThrow();
    expect(() => ((result.relation.initialStandings[0].racePositions as Record<number, number>)[1] = 999)).toThrow();
    const legal = path(result.relation, "Scuderia Ferrari HP");
    const forged = { ...result.relation } as FrozenConstructorSymbolicRelation;
    expect(evaluateFrozenConstructorRelation(forged, legal)).toMatchObject({ status: "INVALID_PATH", code: "INVALID_RELATION" });
    expect(evaluateFrozenConstructorRelation(null as unknown as FrozenConstructorSymbolicRelation, legal)).toMatchObject({ status: "INVALID_PATH", code: "INVALID_RELATION" });
    expect(evaluateFrozenConstructorRelation(result.relation, null as unknown as ReturnType<typeof path>)).toMatchObject({ status: "INVALID_PATH" });
  });

  it("returns stable failures for absent, malformed, and unknown constructor requests", () => {
    expect(buildApprovedFrozenConstructorRelation(null as unknown as ReturnType<typeof request>)).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SNAPSHOT" });
    expect(buildApprovedFrozenConstructorRelation({ ...request("x"), selectedConstructorId: "" })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_SNAPSHOT" });
    expect(buildApprovedFrozenConstructorRelation(request("Unknown Team"))).toMatchObject({ status: "CALCULATION_FAILURE", code: "SELECTED_CONSTRUCTOR_ABSENT" });
  });
});

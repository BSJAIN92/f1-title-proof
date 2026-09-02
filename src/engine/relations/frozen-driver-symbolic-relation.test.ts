import { describe, expect, it } from "vitest";
import manifest from "../../../data/frozen/2026-09-01/manifest.json";
import { APPROVED_FROZEN_SNAPSHOT_FINGERPRINT, buildApprovedFrozenDriverRelation as buildDriverRelation, evaluateFrozenDriverRelation, type FrozenDriverSymbolicRelation, type FrozenRawPath } from "./frozen-driver-symbolic-relation";
import { approvedSnapshotFixture } from "../../test/approved-frozen-fixture";

const snapshot = approvedSnapshotFixture();
const buildApprovedFrozenDriverRelation = (value: Parameters<typeof buildDriverRelation>[0]) => buildDriverRelation(value, snapshot);
const request = (selectedDriverId: string) => ({ selectedDriverId, dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, snapshotFingerprint: APPROVED_FROZEN_SNAPSHOT_FINGERPRINT });

function path(relation: FrozenDriverSymbolicRelation, winner: string, dnsDriver: string, onlyWinner = false): FrozenRawPath {
  const ordered = relation.roster.map(({ driverId }) => driverId).filter((driverId) => driverId !== winner && driverId !== dnsDriver);
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map((constraint) => ({ sessionId: constraint.sessionId, session: constraint.session,
      results: relation.roster.map(({ driverId }) => driverId === winner ? { driverId, position: 1, status: "FINISHED" as const }
        : onlyWinner ? { driverId, position: null, status: "DNS" as const }
        : driverId === dnsDriver ? { driverId, position: null, status: "DNS" as const }
          : { driverId, position: ordered.indexOf(driverId) + 2, status: "FINISHED" as const }) })) };
}

describe("approved frozen 22-driver symbolic relation", () => {
  it.each(["Kimi Antonelli", "George Russell", "Lando Norris", "Sergio Perez"])("constructs the complete finite constraint relation for %s when not ceiling-eliminated", (driver) => {
    const result = buildApprovedFrozenDriverRelation(request(driver));
    expect(result.status).toBe("COMPLETE");
    if (result.status !== "COMPLETE") return;
    expect(result.certificate).toMatchObject({ approved: true, rosterSize: 22, sessionCount: 12 });
    expect(result.relation.eventConstraints.filter(({ session }) => session === "race")).toHaveLength(11);
    expect(result.relation.eventConstraints.filter(({ session }) => session === "sprint")).toHaveLength(1);
    expect(result.relation.eventConstraints.every(({ entrantDriverIds }) => entrantDriverIds.length === 22)).toBe(true);
  });

  it("binds the approved revised calendar, regular lineup, and excludes the completed Dutch substitute from future entrants", () => {
    const result = buildApprovedFrozenDriverRelation(request("Lando Norris"));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    expect(result.relation.eventConstraints.map(({ sessionId }) => sessionId)).toEqual(manifest.remainingSessions.map((item) => `${item.date}:${item.event}:${item.type}`));
    expect(result.relation.roster.map(({ driverId }) => driverId)).not.toContain("Yuki Tsunoda");
    expect(result.relation.roster.map(({ driverId }) => driverId)).toHaveLength(22);
    expect(result.relation.initialStandings.find(({ competitorId }) => competitorId === "Kimi Antonelli")?.points).toBe(242);
  });

  it("classifies full-length legal win and loss witnesses exactly", () => {
    for (const driver of ["Kimi Antonelli", "Lando Norris", "Sergio Perez"]) {
      const result = buildApprovedFrozenDriverRelation(request(driver));
      if (result.status !== "COMPLETE") throw new Error(result.reason);
      const rival = driver === "Kimi Antonelli" ? "George Russell" : "Kimi Antonelli";
      expect(evaluateFrozenDriverRelation(result.relation, path(result.relation, driver, rival, true))).toMatchObject({ status: "VALID", accepted: true, decidedBy: "STRICT_M3_CHAMPION" });
      expect(evaluateFrozenDriverRelation(result.relation, path(result.relation, rival, driver, true))).toMatchObject({ status: "VALID", accepted: false, decidedBy: "NOT_STRICT_M3_CHAMPION" });
    }
  });

  it("agrees for all 22 drivers with an independent strict points-ceiling calculation", () => {
    const futureDrivers = manifest.futureLineup.flatMap(({ drivers }) => drivers);
    const points = new Map(manifest.driverStandings.map(({ driver, points }) => [driver, points]));
    const leaderPoints = Math.max(...futureDrivers.map((driver) => points.get(driver)!));
    const remainingMaximum = manifest.remainingSessions.reduce((total, session) => total + (session.type === "race" ? 25 : 8), 0);
    expect(remainingMaximum).toBe(283);
    expect(leaderPoints - Math.min(...futureDrivers.map((driver) => points.get(driver)!))).toBe(242);
    for (const driver of futureDrivers) {
      const independentlyEliminated = points.get(driver)! + remainingMaximum < leaderPoints;
      expect(buildApprovedFrozenDriverRelation(request(driver)).status).toBe(independentlyEliminated ? "ELIMINATED" : "COMPLETE");
    }
  });

  it("rejects stale, missing, reordered, and illegal 22-driver paths", () => {
    const result = buildApprovedFrozenDriverRelation(request("Lando Norris"));
    if (result.status !== "COMPLETE") throw new Error(result.reason);
    const legal = path(result.relation, "Lando Norris", "Kimi Antonelli");
    expect(evaluateFrozenDriverRelation(result.relation, { ...legal, dataVersion: "stale" })).toMatchObject({ status: "INVALID_PATH", code: "VERSION_MISMATCH" });
    expect(evaluateFrozenDriverRelation(result.relation, { ...legal, sessions: legal.sessions.slice(1) })).toMatchObject({ status: "INVALID_PATH", code: "SESSION_MISMATCH" });
    expect(evaluateFrozenDriverRelation(result.relation, { ...legal, sessions: [legal.sessions[1], legal.sessions[0], ...legal.sessions.slice(2)] })).toMatchObject({ status: "INVALID_PATH", code: "SESSION_MISMATCH" });
    const badFirst = { ...legal.sessions[0], results: legal.sessions[0].results.slice(1) };
    expect(evaluateFrozenDriverRelation(result.relation, { ...legal, sessions: [badFirst, ...legal.sessions.slice(1)] })).toMatchObject({ status: "INVALID_PATH", code: "ILLEGAL_EVENT" });
  });

  it("rejects stale construction requests and does not mutate them", () => {
    const input = request("Lando Norris");
    const before = JSON.stringify(input);
    expect(buildApprovedFrozenDriverRelation({ ...input, snapshotFingerprint: "wrong" })).toMatchObject({ status: "CALCULATION_FAILURE", code: "STALE_SNAPSHOT" });
    expect(JSON.stringify(input)).toBe(before);
    expect(buildApprovedFrozenDriverRelation(input)).toEqual(buildApprovedFrozenDriverRelation(input));
  });
});

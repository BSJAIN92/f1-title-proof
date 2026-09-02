import { describe, expect, it } from "vitest";
import frozen from "../../../data/frozen/2026-09-01/session-results.json";
import countback from "../../../data/frozen/2026-09-01/countback.json";
import type { ScoredEventResult } from "../events/event-outcome";
import { accumulateStandings, compareStandings, type ChampionshipStanding } from "./championship-standings";

const result = (driverId: string, constructorId: string, position: number | null, awardedPoints: number): ScoredEventResult => ({
  driverId, constructorId, position, awardedPoints, status: position === null ? "DNF" : "FINISHED",
});

const standing = (points: number, racePositions: Record<number, number>, qualifyingPositions: Record<number, number> = {}): ChampionshipStanding => ({
  competitorId: "test", points, racePositions, qualifyingPositions,
});

describe("accumulateStandings", () => {
  it("adds driver race and Sprint points but excludes Sprint positions from countback", () => {
    const [driver] = accumulateStandings("driver", [
      { session: "race", results: [result("a", "red", 2, 18)] },
      { session: "sprint", results: [result("a", "red", 1, 8)] },
    ]);
    expect(driver).toMatchObject({ points: 26, racePositions: { 2: 1 } });
  });

  it("sums all constructor entrants and preserves event-specific assignments", () => {
    const teams = accumulateStandings("constructor", [
      { session: "race", results: [result("regular-a", "red", 1, 25), result("regular-b", "red", 2, 18)] },
      { session: "race", results: [result("regular-a", "red", 2, 18), result("substitute", "red", 3, 15), result("regular-b", "blue", 4, 12)] },
    ]);
    expect(teams).toEqual([
      { competitorId: "blue", points: 12, racePositions: { 4: 1 }, qualifyingPositions: {} },
      { competitorId: "red", points: 76, racePositions: { 1: 1, 2: 2, 3: 1 }, qualifyingPositions: {} },
    ]);
  });

  it("combines qualifying positions from both constructor cars", () => {
    const [team] = accumulateStandings("constructor", [], [
      { driverId: "a", constructorId: "red", position: 1 },
      { driverId: "b", constructorId: "red", position: 3 },
    ]);
    expect(team.qualifyingPositions).toEqual({ 1: 1, 3: 1 });
  });

  it("reconstructs approved frozen totals and countback histograms", () => {
    const events = frozen.events.map((event) => ({
      session: event.session as "race" | "sprint",
      results: event.rows.map((row) => ({
        driverId: row.driver, constructorId: row.constructor, position: row.position,
        status: row.status === "DNS" ? "DNS" as const : row.status === "DNF" ? "DNF" as const : "FINISHED" as const,
        awardedPoints: row.awarded_points,
      })),
    }));
    const qualifying = countback.qualifying_events.flatMap((event) => event.rows.map((row) => ({
      driverId: row.driver, constructorId: row.constructor, position: row.position,
    })));
    const drivers = Object.fromEntries(accumulateStandings("driver", events, qualifying).map((item) => [item.competitorId, item]));
    const constructors = Object.fromEntries(accumulateStandings("constructor", events, qualifying).map((item) => [item.competitorId, item]));
    expect(Object.fromEntries(Object.entries(drivers).map(([id, item]) => [id, item.points]))).toEqual(frozen.driver_standings);
    expect(Object.fromEntries(Object.entries(constructors).map(([id, item]) => [id, item.points]))).toEqual(frozen.constructor_standings);
    expect(Object.fromEntries(Object.entries(drivers).map(([id, item]) => [id, item.racePositions]))).toEqual(countback.driver_race_finish_histograms);
    expect(Object.fromEntries(Object.entries(constructors).map(([id, item]) => [id, item.racePositions]))).toEqual(countback.constructor_race_finish_histograms);
    expect(Object.fromEntries(Object.entries(drivers).map(([id, item]) => [id, item.qualifyingPositions]))).toEqual(countback.driver_qualifying_position_histograms);
    expect(Object.fromEntries(Object.entries(constructors).map(([id, item]) => [id, item.qualifyingPositions]))).toEqual(countback.constructor_qualifying_position_histograms);
  });
});

describe("compareStandings", () => {
  it("uses total points first", () => expect(compareStandings(standing(2, {}), standing(1, { 1: 99 }))).toMatchObject({ outcome: "ahead", decidedBy: "points" }));
  it("uses race wins, then P2 and later race positions", () => {
    expect(compareStandings(standing(10, { 1: 2 }), standing(10, { 1: 1, 2: 9 }))).toEqual({ outcome: "ahead", decidedBy: "race", position: 1 });
    expect(compareStandings(standing(10, { 1: 1, 2: 2 }), standing(10, { 1: 1, 2: 1, 3: 9 }))).toEqual({ outcome: "ahead", decidedBy: "race", position: 2 });
    expect(compareStandings(standing(10, { 1: 1, 2: 1, 12: 2 }), standing(10, { 1: 1, 2: 1, 12: 1 }))).toEqual({ outcome: "ahead", decidedBy: "race", position: 12 });
  });
  it("uses qualifying only after all race positions are equal", () => {
    expect(compareStandings(standing(10, { 1: 1 }, { 1: 2 }), standing(10, { 1: 1 }, { 1: 1, 2: 9 }))).toEqual({ outcome: "ahead", decidedBy: "qualifying", position: 1 });
  });
  it("returns a deterministic unresolved outcome when every field is equal", () => {
    expect(compareStandings(standing(10, { 2: 1 }, { 3: 1 }), standing(10, { 2: 1 }, { 3: 1 }))).toEqual({ outcome: "unresolved", decidedBy: "equal" });
  });
});

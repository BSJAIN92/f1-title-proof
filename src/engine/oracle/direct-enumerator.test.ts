import { describe, expect, it } from "vitest";
import type { EventEntrant, ScoredEventResult } from "../events/event-outcome";
import { enumerateEventOutcomes, enumerateWinningRawOutcomes, type TinyFutureEvent } from "./direct-enumerator";

const entrants: EventEntrant[] = [
  { driverId: "a", constructorId: "red" },
  { driverId: "b", constructorId: "blue" },
];
const race: TinyFutureEvent = { id: "race", session: "race", entrants };
const scored = (driverId: string, constructorId: string, position: number | null, awardedPoints: number): ScoredEventResult => ({
  driverId, constructorId, position, awardedPoints, status: position === null ? "DNF" : "FINISHED",
});
const choices = (position: number | null, status: "FINISHED" | "DNF" | "DNS") => [{ position, status }] as const;

describe("direct tiny-fixture enumeration", () => {
  it("lists all 20 legal two-entrant outcomes exactly once", () => {
    const outcomes = enumerateEventOutcomes(race);
    expect(outcomes).toHaveLength(20);
    expect(new Set(outcomes.map(({ id }) => id)).size).toBe(20);
    expect(outcomes.some(({ results }) => results.every(({ status }) => status === "DNS"))).toBe(true);
    expect(outcomes.some(({ results }) => results.some(({ status, position, awardedPoints }) => status === "DNF" && position === 1 && awardedPoints === 25))).toBe(true);
    for (const { results } of outcomes) {
      const positions = results.flatMap(({ position }) => position === null ? [] : [position]);
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  it("uses the M2 Sprint points while M3 ignores Sprint positions for countback", () => {
    const sprint: TinyFutureEvent = {
      id: "sprint", session: "sprint", entrants,
      allowedResults: { a: choices(1, "FINISHED"), b: choices(2, "FINISHED") },
    };
    const completed = [{ session: "race" as const, results: [scored("a", "red", 2, 7), scored("b", "blue", 1, 8)] }];
    expect(enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents: completed, futureEvents: [sprint] })).toHaveLength(0);
  });

  it("returns the exact driver win IDs and handles classified DNF and DNS", () => {
    const fixture: TinyFutureEvent = {
      id: "decider", session: "race", entrants,
      allowedResults: {
        a: [{ position: 1, status: "FINISHED" }, { position: 1, status: "DNF" }, { position: null, status: "DNS" }],
        b: [{ position: 2, status: "FINISHED" }, { position: null, status: "DNF" }],
      },
    };
    const ids = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", futureEvents: [fixture] }).map(({ id }) => id);
    expect(ids).toEqual([
      "decider[a:P1-DNF|b:DNF]",
      "decider[a:P1-DNF|b:P2-FINISHED]",
      "decider[a:P1-FINISHED|b:DNF]",
      "decider[a:P1-FINISHED|b:P2-FINISHED]",
    ]);
  });

  it.each([
    { label: "below", startingPoints: 17, expected: 0 },
    { label: "at", startingPoints: 18, expected: 1 },
    { label: "above", startingPoints: 19, expected: 1 },
  ])("checks the $label boundary around the 7-point maximum swing", ({ startingPoints, expected }) => {
    const fixture: TinyFutureEvent = {
      id: "boundary", session: "race", entrants,
      allowedResults: { a: choices(1, "FINISHED"), b: choices(2, "FINISHED") },
    };
    const completed = [{ session: "sprint" as const, results: [scored("a", "red", null, startingPoints), scored("b", "blue", null, 25)] }];
    expect(enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents: completed, futureEvents: [fixture] })).toHaveLength(expected);
  });

  it("uses race countback and then qualifying fallback", () => {
    const allDns: TinyFutureEvent = {
      id: "none", session: "race", entrants,
      allowedResults: { a: choices(null, "DNS"), b: choices(null, "DNS") },
    };
    const tied = [{ session: "sprint" as const, results: [scored("a", "red", null, 10), scored("b", "blue", null, 10)] }];
    expect(enumerateWinningRawOutcomes({
      kind: "driver", contenderId: "a", completedEvents: [...tied, { session: "race", results: [scored("a", "red", 1, 0), scored("b", "blue", 2, 0)] }], futureEvents: [allDns],
    })).toHaveLength(1);
    expect(enumerateWinningRawOutcomes({
      kind: "driver", contenderId: "a", completedEvents: tied, qualifyingResults: [
        { driverId: "a", constructorId: "red", position: 1 }, { driverId: "b", constructorId: "blue", position: 2 },
      ], futureEvents: [allDns],
    })).toHaveLength(1);
  });

  it("does not call an exact equality a championship win", () => {
    const allDns: TinyFutureEvent = {
      id: "equal", session: "race", entrants,
      allowedResults: { a: choices(null, "DNS"), b: choices(null, "DNS") },
    };
    const tied = [{ session: "sprint" as const, results: [scored("a", "red", null, 10), scored("b", "blue", null, 10)] }];
    const qualifying = [
      { driverId: "a", constructorId: "red", position: 1 },
      { driverId: "b", constructorId: "blue", position: 1 },
    ];
    expect(enumerateWinningRawOutcomes({
      kind: "driver", contenderId: "a", completedEvents: tied, qualifyingResults: qualifying, futureEvents: [allDns],
    })).toHaveLength(0);
  });

  it("uses race countback before conflicting qualifying countback", () => {
    const allDns: TinyFutureEvent = {
      id: "priority", session: "race", entrants,
      allowedResults: { a: choices(null, "DNS"), b: choices(null, "DNS") },
    };
    const completed = [
      { session: "race" as const, results: [scored("a", "red", 1, 10), scored("b", "blue", 2, 10)] },
    ];
    const qualifying = [
      { driverId: "a", constructorId: "red", position: 2 },
      { driverId: "b", constructorId: "blue", position: 1 },
    ];
    expect(enumerateWinningRawOutcomes({
      kind: "driver", contenderId: "a", completedEvents: completed, qualifyingResults: qualifying, futureEvents: [allDns],
    })).toHaveLength(1);
  });

  it("returns the exact constructor win ID using both cars and event-specific teams", () => {
    const four: EventEntrant[] = [
      { driverId: "a1", constructorId: "red" }, { driverId: "a2", constructorId: "red" },
      { driverId: "b1", constructorId: "blue" }, { driverId: "sub", constructorId: "blue" },
    ];
    const fixture: TinyFutureEvent = {
      id: "teams", session: "race", entrants: four,
      allowedResults: {
        a1: choices(1, "FINISHED"), a2: choices(2, "FINISHED"),
        b1: choices(3, "FINISHED"), sub: choices(4, "FINISHED"),
      },
    };
    expect(enumerateWinningRawOutcomes({ kind: "constructor", contenderId: "red", futureEvents: [fixture] }).map(({ id }) => id)).toEqual([
      "teams[a1:P1-FINISHED|a2:P2-FINISHED|b1:P3-FINISHED|sub:P4-FINISHED]",
    ]);
  });

  it("refuses full-grid and full-season use", () => {
    expect(() => enumerateEventOutcomes({ id: "large", session: "race", entrants: Array.from({ length: 5 }, (_, index) => ({ driverId: `${index}`, constructorId: `${index}` })) })).toThrow(/at most 4 entrants/);
    expect(() => enumerateWinningRawOutcomes({
      kind: "driver", contenderId: "a", futureEvents: [race, { ...race, id: "race-2" }, { ...race, id: "race-3" }],
    })).toThrow(/at most 2 future events/);
  });
});

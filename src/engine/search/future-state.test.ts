import { describe, expect, it } from "vitest";
import type { ChampionshipStanding } from "../standings/championship-standings";
import type { ScoredEventResult } from "../events/event-outcome";
import { enumerateWinningRawOutcomes, type TinyFutureEvent } from "../oracle/direct-enumerator";
import { createFutureChampionshipState, futureStateKey, mergeIdenticalFutureStates, type FutureChampionshipState } from "./future-state";

const standing = (competitorId: string, points: number, racePositions = {}, qualifyingPositions = {}): ChampionshipStanding => ({ competitorId, points, racePositions, qualifyingPositions });
const base = (): FutureChampionshipState => ({
  kind: "driver",
  standings: [standing("b", 90, { 2: 1 }, { 1: 1 }), standing("a", 100, { 1: 1 }, { 2: 1 })],
  remainingSessions: [{ id: "r1", session: "race", sequenceIndex: 0 }, { id: "s1", session: "sprint", sequenceIndex: 1 }],
  nextSessionIndex: 0,
});

describe("future-relevant championship state", () => {
  it("is immutable, deterministic, and independent of map insertion or competitor order", () => {
    const left = base();
    const right = { ...base(), standings: [standing("a", 100, { 1: 1, 4: 0 }, { 2: 1 }), standing("b", 90, { 2: 1 }, { 1: 1 })] };
    expect(futureStateKey(left)).toBe(futureStateKey(right));
    const normalized = createFutureChampionshipState(left);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.standings)).toBe(true);
    expect(() => (normalized.standings as ChampionshipStanding[]).push(standing("c", 0))).toThrow();
  });

  it("merges distinct histories only after they converge to the identical state", () => {
    const groups = mergeIdenticalFutureStates([{ history: "a won then DNS", state: base() }, { history: "a DNF then won", state: { ...base(), standings: [...base().standings].reverse() } }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].histories).toEqual(["a won then DNS", "a DNF then won"]);
  });

  it("exhaustively gives converged histories the same champion result under every tiny continuation", () => {
    const scored = (driverId: string, position: number, awardedPoints: number): ScoredEventResult => ({ driverId, constructorId: driverId, position, awardedPoints, status: "FINISHED" });
    const entrants = [{ driverId: "a", constructorId: "a" }, { driverId: "b", constructorId: "b" }];
    const future: TinyFutureEvent = { id: "all", session: "race", entrants };
    const historyOne = [{ session: "race" as const, results: [scored("a", 1, 25), scored("b", 2, 18)] }, { session: "race" as const, results: [scored("a", 2, 18), scored("b", 1, 25)] }];
    const historyTwo = [...historyOne].reverse();
    const winsOne = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents: historyOne, futureEvents: [future] }).map(({ id }) => id);
    const winsTwo = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents: historyTwo, futureEvents: [future] }).map(({ id }) => id);
    expect(winsOne).toEqual(winsTwo);
    expect(winsOne.length).toBeGreaterThan(0);
  });

  it.each([
    ["driver race", "driver", "race"], ["driver Sprint", "driver", "sprint"],
    ["constructor race", "constructor", "race"], ["constructor Sprint", "constructor", "sprint"],
  ] as const)("preserves every selected-champion comparison for converged %s histories", (_label, kind, session) => {
    const scored = (driverId: string, constructorId: string, position: number, awardedPoints: number): ScoredEventResult => ({ driverId, constructorId, position, awardedPoints, status: "FINISHED" });
    const entrants = kind === "driver"
      ? [{ driverId: "a", constructorId: "red" }, { driverId: "b", constructorId: "blue" }]
      : [{ driverId: "a1", constructorId: "red" }, { driverId: "a2", constructorId: "red" }, { driverId: "b1", constructorId: "blue" }, { driverId: "b2", constructorId: "blue" }];
    const firstResults = entrants.map((entrant, index) => scored(entrant.driverId, entrant.constructorId, index + 1, entrants.length - index));
    const secondResults = [...firstResults].reverse().map((result, index) => ({ ...result, position: index + 1, awardedPoints: index + 1 }));
    const historyOne = [{ session: "race" as const, results: firstResults }, { session: "race" as const, results: secondResults }];
    const historyTwo = [...historyOne].reverse();
    const future: TinyFutureEvent = { id: "future", session, entrants };
    for (const contenderId of kind === "driver" ? ["a", "b"] : ["red", "blue"]) {
      const left = enumerateWinningRawOutcomes({ kind, contenderId, completedEvents: historyOne, futureEvents: [future] }).map(({ id }) => id);
      const right = enumerateWinningRawOutcomes({ kind, contenderId, completedEvents: historyTwo, futureEvents: [future] }).map(({ id }) => id);
      expect(left).toEqual(right);
    }
  });

  it("preserves race-first and qualifying-fallback comparisons after histories converge", () => {
    const entrants = [{ driverId: "a", constructorId: "red" }, { driverId: "b", constructorId: "blue" }];
    const dns = (driverId: string, constructorId: string): ScoredEventResult => ({ driverId, constructorId, position: null, awardedPoints: 0, status: "DNS" });
    const future: TinyFutureEvent = { id: "dns", session: "race", entrants, allowedResults: { a: [{ position: null, status: "DNS" }], b: [{ position: null, status: "DNS" }] } };
    const completed = [{ session: "sprint" as const, results: [dns("a", "red"), dns("b", "blue")] }];
    for (const qualifyingResults of [
      [{ driverId: "a", constructorId: "red", position: 1 }, { driverId: "b", constructorId: "blue", position: 2 }],
      [{ driverId: "a", constructorId: "red", position: 2 }, { driverId: "b", constructorId: "blue", position: 1 }],
    ]) {
      const left = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents: completed, qualifyingResults, futureEvents: [future] });
      const right = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents: [...completed].reverse(), qualifyingResults: [...qualifyingResults].reverse(), futureEvents: [future] });
      expect(left.map(({ id }) => id)).toEqual(right.map(({ id }) => id));
    }
  });

  it.each([
    ["points", (s: FutureChampionshipState) => ({ ...s, standings: [standing("b", 91, { 2: 1 }, { 1: 1 }), s.standings[1]] })],
    ["race countback", (s: FutureChampionshipState) => ({ ...s, standings: [standing("b", 90, { 1: 1 }, { 1: 1 }), s.standings[1]] })],
    ["qualifying countback", (s: FutureChampionshipState) => ({ ...s, standings: [standing("b", 90, { 2: 1 }, { 2: 1 }), s.standings[1]] })],
    ["competitor set", (s: FutureChampionshipState) => ({ ...s, standings: [...s.standings, standing("c", 0)] })],
    ["session kind", (s: FutureChampionshipState) => ({ ...s, remainingSessions: [{ id: "r1", session: "sprint" as const, sequenceIndex: 0 }, s.remainingSessions[1]] })],
    ["session order", (s: FutureChampionshipState) => ({ ...s, remainingSessions: [{ id: "s1", session: "sprint" as const, sequenceIndex: 0 }, { id: "r1", session: "race" as const, sequenceIndex: 1 }] })],
    ["session index", (s: FutureChampionshipState) => ({ ...s, nextSessionIndex: 1 })],
    ["championship kind", (s: FutureChampionshipState) => ({ ...s, kind: "constructor" as const })],
  ] as const)("does not merge a near miss differing in %s", (_label, change) => {
    expect(mergeIdenticalFutureStates([{ history: 1, state: base() }, { history: 2, state: change(base()) }])).toHaveLength(2);
  });
});

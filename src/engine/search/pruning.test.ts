import { describe, expect, it } from "vitest";
import type { ChampionshipStanding } from "../standings/championship-standings";
import type { FutureChampionshipState } from "./future-state";
import { proveStateCannotWin } from "./pruning";
import { enumerateWinningRawOutcomes, type TinyFutureEvent } from "../oracle/direct-enumerator";
import type { ScoredEventResult } from "../events/event-outcome";

const standing = (competitorId: string, points: number, racePositions = {}, qualifyingPositions = {}): ChampionshipStanding => ({ competitorId, points, racePositions, qualifyingPositions });
const state = (kind: "driver" | "constructor", target: ChampionshipStanding, rival: ChampionshipStanding, sessions: ("race" | "sprint")[]): FutureChampionshipState => ({
  kind, standings: [target, rival], nextSessionIndex: 0,
  remainingSessions: sessions.map((session, sequenceIndex) => ({ id: `${session}-${sequenceIndex}`, session, sequenceIndex })),
});

describe("proof-safe pruning", () => {
  it.each([
    ["driver race", "driver", "race", 25], ["driver Sprint", "driver", "sprint", 8],
    ["constructor race", "constructor", "race", 43], ["constructor Sprint", "constructor", "sprint", 15],
  ] as const)("uses the exact %s ceiling and keeps below/at while pruning above", (_label, kind, session, maximum) => {
    for (const delta of [-1, 0, 1]) {
      const proof = proveStateCannotWin(state(kind, standing("target", 0), standing("rival", maximum + delta), [session]), "target");
      expect(proof.pruned).toBe(delta === 1);
      if (delta === 1 && proof.pruned && proof.rule === "STRICT_POINTS_CEILING") {
        expect(proof).toMatchObject({ maximumAdditionalPoints: maximum, ceiling: maximum, rivalFloor: maximum + 1 });
      }
    }
  });

  it("adds race and Sprint maxima across the exact remaining suffix", () => {
    const input = state("driver", standing("target", 10), standing("rival", 43), ["race", "sprint"]);
    expect(proveStateCannotWin(input, "target").pruned).toBe(false);
    expect(proveStateCannotWin({ ...input, standings: [standing("target", 10), standing("rival", 44.1)] }, "target")).toMatchObject({ rule: "STRICT_POINTS_CEILING", maximumAdditionalPoints: 33 });
  });

  it("never prunes points equality because race countback can rescue it", () => {
    const proof = proveStateCannotWin(state("driver", standing("target", 0, { 1: 1 }), standing("rival", 25, { 2: 1 }), ["race"]), "target");
    expect(proof).toEqual({ pruned: false, rule: "KEEP", reason: expect.stringContaining("strictly above") });
  });

  it("terminal pruning uses points, race countback, then qualifying and requires a strict champion", () => {
    expect(proveStateCannotWin(state("driver", standing("target", 10, { 1: 1 }), standing("rival", 10, { 2: 1 }), []), "target").pruned).toBe(false);
    expect(proveStateCannotWin(state("driver", standing("target", 10, { 2: 1 }, { 1: 1 }), standing("rival", 10, { 1: 1 }, { 2: 1 }), []), "target")).toMatchObject({ pruned: true, rule: "TERMINAL_NOT_STRICT_CHAMPION", comparison: { decidedBy: "race" } });
    expect(proveStateCannotWin(state("driver", standing("target", 10, {}, { 2: 1 }), standing("rival", 10, {}, { 1: 1 }), []), "target")).toMatchObject({ pruned: true, comparison: { decidedBy: "qualifying" } });
    expect(proveStateCannotWin(state("driver", standing("target", 10), standing("rival", 10), []), "target")).toMatchObject({ pruned: true, comparison: { outcome: "unresolved" } });
  });

  it("fails safely when a required precondition is absent or malformed", () => {
    expect(proveStateCannotWin(state("driver", standing("other", 1), standing("rival", 2), ["race"]), "missing")).toMatchObject({ pruned: false });
    const malformed = { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), nextSessionIndex: -1 };
    expect(proveStateCannotWin(malformed, "target")).toMatchObject({ pruned: false });
  });

  it.each([
    ["invalid kind", { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), kind: "team" }],
    ["missing histogram", { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), standings: [{ competitorId: "target", points: 1, qualifyingPositions: {} }, standing("rival", 2)] }],
    ["null histogram", { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), standings: [{ ...standing("target", 1), racePositions: null }, standing("rival", 2)] }],
    ["empty competitor ID", state("driver", standing("", 1), standing("rival", 2), ["race"])],
    ["duplicate competitor ID", state("driver", standing("target", 1), standing("target", 2), ["race"])],
    ["negative points", state("driver", standing("target", -1), standing("rival", 2), ["race"])],
    ["bad histogram position", state("driver", standing("target", 1, { 0: 1 }), standing("rival", 2), ["race"])],
    ["bad histogram count", state("driver", standing("target", 1, { 1: -1 }), standing("rival", 2), ["race"])],
    ["missing sessions", { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), remainingSessions: null }],
    ["duplicate session IDs", { ...state("driver", standing("target", 1), standing("rival", 2), ["race", "sprint"]), remainingSessions: [{ id: "same", session: "race", sequenceIndex: 0 }, { id: "same", session: "sprint", sequenceIndex: 1 }] }],
    ["bad session kind", { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), remainingSessions: [{ id: "x", session: "qualifying", sequenceIndex: 0 }] }],
    ["bad session index", { ...state("driver", standing("target", 1), standing("rival", 2), ["race"]), remainingSessions: [{ id: "x", session: "race", sequenceIndex: 2 }] }],
  ])("keeps without throwing for runtime-malformed evidence: %s", (_label, malformed) => {
    expect(() => proveStateCannotWin(malformed as FutureChampionshipState, "target")).not.toThrow();
    expect(proveStateCannotWin(malformed as FutureChampionshipState, "target")).toMatchObject({ pruned: false, rule: "KEEP" });
  });

  it("accepts valid empty and zero-valued countback histograms", () => {
    expect(proveStateCannotWin(state("driver", standing("target", 0, {}, { 1: 0 }), standing("rival", 0), ["race"]), "target")).toMatchObject({ pruned: false });
  });

  it("matches unpruned exhaustive driver continuations at the strict ceiling boundary", () => {
    const entrants = [{ driverId: "target", constructorId: "red" }, { driverId: "rival", constructorId: "blue" }];
    const future: TinyFutureEvent = { id: "race", session: "race", entrants };
    const scored = (driverId: string, constructorId: string, points: number): ScoredEventResult => ({ driverId, constructorId, position: null, awardedPoints: points, status: "DNF" });
    for (const rivalPoints of [24, 25, 26]) {
      const completed = [{ session: "sprint" as const, results: [scored("target", "red", 0), scored("rival", "blue", rivalPoints)] }];
      const wins = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "target", completedEvents: completed, futureEvents: [future] });
      const proof = proveStateCannotWin(state("driver", standing("target", 0), standing("rival", rivalPoints), ["race"]), "target");
      if (proof.pruned) expect(wins).toHaveLength(0);
      if (rivalPoints === 25) expect(proof.pruned).toBe(false); // some tied-points paths win by race countback
    }
  });

  it("matches an unpruned both-car constructor continuation at its strict ceiling", () => {
    const entrants = [
      { driverId: "t1", constructorId: "target" }, { driverId: "t2", constructorId: "target" },
      { driverId: "r1", constructorId: "rival" }, { driverId: "r2", constructorId: "rival" },
    ];
    const fixed = (position: number) => [{ position, status: "FINISHED" as const }];
    const future: TinyFutureEvent = { id: "teams", session: "race", entrants, allowedResults: { t1: fixed(1), t2: fixed(2), r1: fixed(3), r2: fixed(4) } };
    const scored = (driverId: string, constructorId: string, points: number): ScoredEventResult => ({ driverId, constructorId, position: null, awardedPoints: points, status: "DNF" });
    for (const rivalPoints of [42, 43, 44]) {
      const completed = [{ session: "sprint" as const, results: [scored("t1", "target", 0), scored("r1", "rival", rivalPoints)] }];
      const wins = enumerateWinningRawOutcomes({ kind: "constructor", contenderId: "target", completedEvents: completed, futureEvents: [future] });
      const proof = proveStateCannotWin(state("constructor", standing("target", 0), standing("rival", rivalPoints), ["race"]), "target");
      if (proof.pruned) expect(wins).toHaveLength(0);
      expect(proof.pruned).toBe(rivalPoints === 44);
    }
  });

  it.each([
    ["driver race", "driver", "race", 25], ["driver Sprint", "driver", "sprint", 8],
    ["constructor race", "constructor", "race", 43], ["constructor Sprint", "constructor", "sprint", 15],
  ] as const)("removes zero winning paths across exhaustive below/at/above %s continuations", (_label, kind, session, maximum) => {
    const entrants = kind === "driver"
      ? [{ driverId: "t1", constructorId: "target" }, { driverId: "r1", constructorId: "rival" }]
      : [{ driverId: "t1", constructorId: "target" }, { driverId: "t2", constructorId: "target" }, { driverId: "r1", constructorId: "rival" }, { driverId: "r2", constructorId: "rival" }];
    const future: TinyFutureEvent = { id: `${kind}-${session}`, session, entrants };
    const targetId = kind === "driver" ? "t1" : "target";
    const rivalId = kind === "driver" ? "r1" : "rival";
    const scored = (driverId: string, constructorId: string, points: number): ScoredEventResult => ({ driverId, constructorId, position: null, awardedPoints: points, status: "DNF" });
    for (const rivalPoints of [maximum - 1, maximum, maximum + 1]) {
      const completed = [{ session: "sprint" as const, results: [scored("t1", "target", 0), scored("r1", "rival", rivalPoints)] }];
      const wins = enumerateWinningRawOutcomes({ kind, contenderId: targetId, completedEvents: completed, futureEvents: [future] });
      const proof = proveStateCannotWin(state(kind, standing(targetId, 0), standing(rivalId, rivalPoints), [session]), targetId);
      expect(proof.pruned).toBe(rivalPoints === maximum + 1);
      if (proof.pruned) expect(wins).toHaveLength(0);
    }
  });

  it.each(["driver", "constructor"] as const)("keeps an exhaustive %s race equality where countback rescues the target", (kind) => {
    const entrants = kind === "driver"
      ? [{ driverId: "t1", constructorId: "target" }, { driverId: "r1", constructorId: "rival" }]
      : [{ driverId: "t1", constructorId: "target" }, { driverId: "t2", constructorId: "target" }, { driverId: "r1", constructorId: "rival" }, { driverId: "r2", constructorId: "rival" }];
    const future: TinyFutureEvent = { id: "equality-race", session: "race", entrants };
    const maximum = kind === "driver" ? 25 : 43;
    const targetId = kind === "driver" ? "t1" : "target";
    const rivalId = kind === "driver" ? "r1" : "rival";
    const completed = [{ session: "sprint" as const, results: [
      { driverId: "t1", constructorId: "target", position: null, awardedPoints: 0, status: "DNF" as const },
      { driverId: "r1", constructorId: "rival", position: null, awardedPoints: maximum, status: "DNF" as const },
    ] }];
    const wins = enumerateWinningRawOutcomes({ kind, contenderId: targetId, completedEvents: completed, futureEvents: [future] });
    expect(proveStateCannotWin(state(kind, standing(targetId, 0), standing(rivalId, maximum), ["race"]), targetId).pruned).toBe(false);
    expect(wins.length).toBeGreaterThan(0);
  });
});

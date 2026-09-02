import { describe, expect, it } from "vitest";
import { enumerateEventOutcomes, enumerateWinningRawOutcomes, type TinyFutureEvent } from "../oracle/direct-enumerator";
import { accumulateStandings, type ChampionshipStanding, type QualifyingResult, type ScoredChampionshipEvent } from "../standings/championship-standings";
import {
  calculateDriverWinningRelation, createTrustedFutureSessionDomain, enumerateAcceptedRawPathIds,
  relationAccepts, type TrustedFutureSessionDomain,
} from "./driver-winning-relation";

const versions = { dataVersion: "freeze-1", ruleVersion: "rules-1" };
const entrants = [{ driverId: "a", constructorId: "red" }, { driverId: "b", constructorId: "blue" }];
const standing = (competitorId: string, points = 0, racePositions = {}, qualifyingPositions = {}): ChampionshipStanding => ({ competitorId, points, racePositions, qualifyingPositions });

function domain(fixture: TinyFutureEvent, sequenceIndex: number): TrustedFutureSessionDomain {
  const made = createTrustedFutureSessionDomain({ ...versions, sessionId: fixture.id, sequenceIndex, session: fixture.session,
    entrants: fixture.entrants });
  if (made.status !== "TRUSTED") throw new Error(made.reason);
  return made.domain;
}

function compareToOracle(futureEvents: readonly TinyFutureEvent[], completedEvents: readonly ScoredChampionshipEvent[] = [], qualifyingResults: readonly QualifyingResult[] = []): void {
  const oracle = enumerateWinningRawOutcomes({ kind: "driver", contenderId: "a", completedEvents, qualifyingResults, futureEvents }).map(({ id }) => id);
  const initialStandings = accumulateStandings("driver", completedEvents, qualifyingResults);
  const withMissing = ["a", "b"].filter((id) => !initialStandings.some((s) => s.competitorId === id)).map((id) => standing(id));
  const result = calculateDriverWinningRelation({ ...versions, selectedDriverId: "a", initialStandings: [...initialStandings, ...withMissing], domains: futureEvents.map(domain), maxExploredEdges: 100000 });
  if (oracle.length === 0) { expect(result.status).toBe("ELIMINATED"); return; }
  expect(result.status).toBe("COMPLETE");
  if (result.status !== "COMPLETE") return;
  expect(enumerateAcceptedRawPathIds(result.relation, 100000)).toEqual(oracle);
  for (const id of oracle) expect(relationAccepts(result.relation, id.split("+"))).toBe(true);
}

describe("exact driver winning relation", () => {
  it("matches the independent oracle for race and Sprint outcomes including classified DNF, DNF, and DNS", () => {
    compareToOracle([{ id: "race", session: "race", entrants }]);
    compareToOracle([{ id: "sprint", session: "sprint", entrants }]);
  });

  it("matches multi-session points and retains raw prefixes when future states merge", () => {
    const first: TinyFutureEvent = { id: "first", session: "sprint", entrants };
    const second: TinyFutureEvent = { id: "second", session: "race", entrants };
    compareToOracle([first, second]);
  });

  it("matches race countback, qualifying fallback, and exact unresolved equality as a loss", () => {
    const dns: TinyFutureEvent = { id: "dns", session: "race", entrants };
    compareToOracle([dns], [], [{ driverId: "a", constructorId: "red", position: 1 }, { driverId: "b", constructorId: "blue", position: 2 }]);
    compareToOracle([dns], [], [{ driverId: "a", constructorId: "red", position: 2 }, { driverId: "b", constructorId: "blue", position: 1 }]);
    compareToOracle([dns]);
  });

  it("keeps equality at the mathematical ceiling so race countback can rescue the selected driver", () => {
    const race: TinyFutureEvent = { id: "race", session: "race", entrants };
    const initial = [standing("a", 0), standing("b", 25)];
    const result = calculateDriverWinningRelation({ ...versions, selectedDriverId: "a", initialStandings: initial, domains: [domain(race, 0)], maxExploredEdges: 10000 });
    expect(result.status).toBe("COMPLETE");
  });

  it.each([[24, "COMPLETE"], [25, "COMPLETE"], [26, "ELIMINATED"]] as const)("handles below, at, and above the 25-point race ceiling: %s", (lead, status) => {
    const result = calculateDriverWinningRelation({ ...versions, selectedDriverId: "a", initialStandings: [standing("a"), standing("b", lead)], domains: [domain({ id: "race", session: "race", entrants }, 0)], maxExploredEdges: 10000 });
    expect(result.status).toBe(status);
  });

  it("internally generates complete domains and rejects unsupported bounded size", () => {
    const made = createTrustedFutureSessionDomain({ ...versions, sessionId: "x", sequenceIndex: 0, session: "race", entrants });
    expect(made).toMatchObject({ status: "TRUSTED", domain: { certificate: { outcomeCount: enumerateEventOutcomes({ id: "x", session: "race", entrants }).length } } });
    const five = [...entrants, { driverId: "c", constructorId: "c" }, { driverId: "d", constructorId: "d" }, { driverId: "e", constructorId: "e" }];
    expect(createTrustedFutureSessionDomain({ ...versions, sessionId: "large", sequenceIndex: 0, session: "race", entrants: five })).toMatchObject({ status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT_EXCEEDED" });
  });

  it("fails on alignment, versions, absent selected driver, and resources without a partial relation", () => {
    const trusted = domain({ id: "race", session: "race", entrants }, 0);
    const base = { ...versions, selectedDriverId: "a", initialStandings: [standing("a"), standing("b")], domains: [trusted], maxExploredEdges: 10000 };
    expect(calculateDriverWinningRelation({ ...base, domains: [{ ...trusted, sequenceIndex: 1 }] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "SESSION_ALIGNMENT_MISMATCH" });
    expect(calculateDriverWinningRelation({ ...base, ruleVersion: "wrong" })).toMatchObject({ status: "CALCULATION_FAILURE", code: "VERSION_MISMATCH" });
    expect(calculateDriverWinningRelation({ ...base, initialStandings: [standing("b")] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "SELECTED_DRIVER_ABSENT" });
    expect(calculateDriverWinningRelation({ ...base, maxExploredEdges: 0 })).toEqual({ status: "CALCULATION_FAILURE", code: "RESOURCE_LIMIT_EXCEEDED", reason: expect.stringContaining("no partial relation") });
    const forged = { ...trusted, outcomes: trusted.outcomes.slice(0, 1), certificate: { ...trusted.certificate, outcomeCount: 1 } } as TrustedFutureSessionDomain;
    expect(calculateDriverWinningRelation({ ...base, domains: [forged] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INCOMPLETE_DOMAIN" });
  });

  it("requires exact unique competitor alignment in standings and every session", () => {
    const trusted = domain({ id: "race", session: "race", entrants }, 0);
    const base = { ...versions, selectedDriverId: "a", domains: [trusted], maxExploredEdges: 10000 };
    expect(calculateDriverWinningRelation({ ...base, initialStandings: [standing("a"), standing("b"), standing("extra")] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "SESSION_ALIGNMENT_MISMATCH" });
    expect(calculateDriverWinningRelation({ ...base, initialStandings: [standing("a")] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "SESSION_ALIGNMENT_MISMATCH" });
    expect(calculateDriverWinningRelation({ ...base, initialStandings: [standing("a"), standing("a")] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_INPUT" });
    expect(calculateDriverWinningRelation({ ...base, initialStandings: [standing("a"), standing("")] })).toMatchObject({ status: "CALCULATION_FAILURE", code: "INVALID_INPUT" });
  });

  it("bounds accepted-path traversal immediately and rejects malformed cyclic relations", () => {
    const result = calculateDriverWinningRelation({ ...versions, selectedDriverId: "a", initialStandings: [standing("a"), standing("b")], domains: [domain({ id: "race", session: "race", entrants }, 0)], maxExploredEdges: 10000 });
    expect(result.status).toBe("COMPLETE");
    if (result.status !== "COMPLETE") return;
    expect(() => enumerateAcceptedRawPathIds(result.relation, 1)).toThrow(/exceeded/);
    expect(() => enumerateAcceptedRawPathIds(result.relation, 0)).toThrow(/positive/);
    const cyclic = { rootNodeId: "N0", sessionIds: ["x"], nodes: [{ id: "N0", sessionId: "x", edges: [{ outcomeId: "o", destination: "N0" }] }] } as const;
    expect(() => enumerateAcceptedRawPathIds(cyclic, 1)).toThrow(/cycle/);
  });

  it("does not mutate caller inputs and produces deterministic relation keys", () => {
    const trusted = domain({ id: "race", session: "race", entrants }, 0);
    const standings = [standing("b"), standing("a")];
    const before = JSON.stringify({ trusted, standings });
    const question = { ...versions, selectedDriverId: "a", initialStandings: standings, domains: [trusted], maxExploredEdges: 10000 };
    const left = calculateDriverWinningRelation(question);
    const right = calculateDriverWinningRelation(question);
    expect(JSON.stringify({ trusted, standings })).toBe(before);
    expect(left).toEqual(right);
  });
});

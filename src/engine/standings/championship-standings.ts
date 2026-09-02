import type { ScoredEventResult, SessionType } from "../events/event-outcome";

export type ChampionshipKind = "driver" | "constructor";
export type PositionHistogram = Readonly<Record<number, number>>;

export interface ScoredChampionshipEvent {
  readonly session: SessionType;
  readonly results: readonly ScoredEventResult[];
}

export interface QualifyingResult {
  readonly driverId: string;
  readonly constructorId: string;
  readonly position: number | null;
}

export interface ChampionshipStanding {
  readonly competitorId: string;
  readonly points: number;
  readonly racePositions: PositionHistogram;
  readonly qualifyingPositions: PositionHistogram;
}

export type StandingComparison =
  | { readonly outcome: "ahead" | "behind"; readonly decidedBy: "points" | "race" | "qualifying"; readonly position?: number }
  | { readonly outcome: "unresolved"; readonly decidedBy: "equal" };

interface MutableStanding {
  competitorId: string;
  points: number;
  racePositions: Record<number, number>;
  qualifyingPositions: Record<number, number>;
}

function getStanding(map: Map<string, MutableStanding>, competitorId: string): MutableStanding {
  let standing = map.get(competitorId);
  if (!standing) {
    standing = { competitorId, points: 0, racePositions: {}, qualifyingPositions: {} };
    map.set(competitorId, standing);
  }
  return standing;
}

function increment(histogram: Record<number, number>, position: number): void {
  histogram[position] = (histogram[position] ?? 0) + 1;
}

export function accumulateStandings(
  kind: ChampionshipKind,
  events: readonly ScoredChampionshipEvent[],
  qualifyingResults: readonly QualifyingResult[] = [],
): readonly ChampionshipStanding[] {
  const standings = new Map<string, MutableStanding>();

  for (const event of events) {
    for (const result of event.results) {
      const competitorId = kind === "driver" ? result.driverId : result.constructorId;
      const standing = getStanding(standings, competitorId);
      standing.points += result.awardedPoints;
      if (event.session === "race" && result.position !== null) {
        increment(standing.racePositions, result.position);
      }
    }
  }

  for (const result of qualifyingResults) {
    if (result.position === null) continue;
    const competitorId = kind === "driver" ? result.driverId : result.constructorId;
    increment(getStanding(standings, competitorId).qualifyingPositions, result.position);
  }

  return [...standings.values()]
    .map((standing) => ({
      competitorId: standing.competitorId,
      points: standing.points,
      racePositions: { ...standing.racePositions },
      qualifyingPositions: { ...standing.qualifyingPositions },
    }))
    .sort((left, right) => left.competitorId.localeCompare(right.competitorId));
}

function compareHistogram(
  left: PositionHistogram,
  right: PositionHistogram,
): { direction: -1 | 0 | 1; position?: number } {
  const maximumPosition = Math.max(
    0,
    ...Object.keys(left).map(Number),
    ...Object.keys(right).map(Number),
  );
  for (let position = 1; position <= maximumPosition; position += 1) {
    const difference = (left[position] ?? 0) - (right[position] ?? 0);
    if (difference !== 0) {
      return { direction: difference > 0 ? 1 : -1, position };
    }
  }
  return { direction: 0 };
}

export function compareStandings(
  left: ChampionshipStanding,
  right: ChampionshipStanding,
): StandingComparison {
  if (left.points !== right.points) {
    return { outcome: left.points > right.points ? "ahead" : "behind", decidedBy: "points" };
  }
  const race = compareHistogram(left.racePositions, right.racePositions);
  if (race.direction !== 0) {
    return { outcome: race.direction > 0 ? "ahead" : "behind", decidedBy: "race", position: race.position };
  }
  const qualifying = compareHistogram(left.qualifyingPositions, right.qualifyingPositions);
  if (qualifying.direction !== 0) {
    return { outcome: qualifying.direction > 0 ? "ahead" : "behind", decidedBy: "qualifying", position: qualifying.position };
  }
  return { outcome: "unresolved", decidedBy: "equal" };
}

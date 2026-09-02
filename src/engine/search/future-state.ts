import type { SessionType } from "../events/event-outcome";
import type { ChampionshipKind, ChampionshipStanding, PositionHistogram } from "../standings/championship-standings";

export interface RemainingSession {
  readonly id: string;
  readonly session: SessionType;
  readonly sequenceIndex: number;
}

export interface FutureChampionshipState {
  readonly kind: ChampionshipKind;
  readonly standings: readonly ChampionshipStanding[];
  readonly remainingSessions: readonly RemainingSession[];
  readonly nextSessionIndex: number;
}

export interface HistoricalState<T> {
  readonly history: T;
  readonly state: FutureChampionshipState;
}

export interface MergedState<T> {
  readonly key: string;
  readonly state: FutureChampionshipState;
  readonly histories: readonly T[];
}

function normalizeHistogram(histogram: PositionHistogram): Readonly<Record<number, number>> {
  const normalized: Record<number, number> = {};
  for (const [positionText, count] of Object.entries(histogram).sort(([left], [right]) => Number(left) - Number(right))) {
    const position = Number(positionText);
    if (!Number.isInteger(position) || position < 1 || !Number.isInteger(count) || count < 0) {
      throw new Error("Countback histograms require positive integer positions and non-negative integer counts.");
    }
    if (count > 0) normalized[position] = count;
  }
  return Object.freeze(normalized);
}

export function createFutureChampionshipState(input: FutureChampionshipState): FutureChampionshipState {
  if (!Number.isInteger(input.nextSessionIndex) || input.nextSessionIndex < 0 || input.nextSessionIndex > input.remainingSessions.length) {
    throw new Error("nextSessionIndex must identify a position in the remaining session sequence.");
  }
  const competitorIds = new Set<string>();
  const standings = [...input.standings].sort((a, b) => a.competitorId.localeCompare(b.competitorId)).map((standing) => {
    if (!standing.competitorId || competitorIds.has(standing.competitorId)) throw new Error("Competitor IDs must be non-empty and unique.");
    if (!Number.isFinite(standing.points)) throw new Error("Competitor points must be finite.");
    competitorIds.add(standing.competitorId);
    return Object.freeze({
      competitorId: standing.competitorId,
      points: standing.points,
      racePositions: normalizeHistogram(standing.racePositions),
      qualifyingPositions: normalizeHistogram(standing.qualifyingPositions),
    });
  });
  const remainingSessions = input.remainingSessions.map((session, index) => {
    if (!session.id || session.sequenceIndex !== index) throw new Error("Remaining sessions require stable IDs and contiguous sequence indexes.");
    return Object.freeze({ ...session });
  });
  return Object.freeze({ kind: input.kind, standings: Object.freeze(standings), remainingSessions: Object.freeze(remainingSessions), nextSessionIndex: input.nextSessionIndex });
}

export function futureStateKey(input: FutureChampionshipState): string {
  const state = createFutureChampionshipState(input);
  return JSON.stringify({
    kind: state.kind,
    standings: state.standings.map((standing) => [standing.competitorId, standing.points, standing.racePositions, standing.qualifyingPositions]),
    remainingSessions: state.remainingSessions.map(({ id, session, sequenceIndex }) => [sequenceIndex, id, session]),
    nextSessionIndex: state.nextSessionIndex,
  });
}

/** Merges raw histories if and only if their complete future-relevant canonical keys match. */
export function mergeIdenticalFutureStates<T>(items: readonly HistoricalState<T>[]): readonly MergedState<T>[] {
  const merged = new Map<string, { state: FutureChampionshipState; histories: T[] }>();
  for (const item of items) {
    const state = createFutureChampionshipState(item.state);
    const key = futureStateKey(state);
    const existing = merged.get(key);
    if (existing) existing.histories.push(item.history);
    else merged.set(key, { state, histories: [item.history] });
  }
  return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => Object.freeze({ key, state: value.state, histories: Object.freeze(value.histories) }));
}

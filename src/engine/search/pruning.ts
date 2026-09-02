import { compareStandings } from "../standings/championship-standings";
import type { FutureChampionshipState } from "./future-state";

export type PruningProof =
  | { readonly pruned: false; readonly rule: "KEEP"; readonly reason: string }
  | { readonly pruned: true; readonly rule: "STRICT_POINTS_CEILING"; readonly contenderId: string; readonly rivalId: string; readonly currentPoints: number; readonly maximumAdditionalPoints: number; readonly ceiling: number; readonly rivalFloor: number }
  | { readonly pruned: true; readonly rule: "TERMINAL_NOT_STRICT_CHAMPION"; readonly contenderId: string; readonly blockingRivalId: string; readonly comparison: ReturnType<typeof compareStandings> };

const SESSION_MAXIMUM = {
  driver: { race: 25, sprint: 8 },
  constructor: { race: 43, sprint: 15 },
} as const;

function keep(reason: string): PruningProof {
  return { pruned: false, rule: "KEEP", reason };
}

function validHistogram(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([position, count]) => {
    const numericPosition = Number(position);
    return String(numericPosition) === position && Number.isInteger(numericPosition) && numericPosition > 0
      && Number.isInteger(count) && (count as number) >= 0;
  });
}

function malformedReason(value: unknown): string | null {
  if (value === null || typeof value !== "object") return "The championship state is absent or malformed.";
  const candidate = value as Partial<FutureChampionshipState>;
  if (candidate.kind !== "driver" && candidate.kind !== "constructor") return "The championship kind is absent or unsupported.";
  if (!Array.isArray(candidate.standings)) return "The competitor standings are absent or malformed.";
  const ids = new Set<string>();
  for (const standing of candidate.standings) {
    if (standing === null || typeof standing !== "object") return "A competitor standing is malformed.";
    if (typeof standing.competitorId !== "string" || standing.competitorId.length === 0 || ids.has(standing.competitorId)) return "Competitor IDs must be non-empty and unique.";
    ids.add(standing.competitorId);
    if (!Number.isFinite(standing.points) || standing.points < 0) return "Competitor points must be finite and non-negative.";
    if (!validHistogram(standing.racePositions) || !validHistogram(standing.qualifyingPositions)) return "Countback histograms are absent or malformed.";
  }
  if (!Array.isArray(candidate.remainingSessions)) return "The remaining session sequence is absent or malformed.";
  const sessionIds = new Set<string>();
  for (let index = 0; index < candidate.remainingSessions.length; index += 1) {
    const session = candidate.remainingSessions[index];
    if (session === null || typeof session !== "object" || typeof session.id !== "string" || session.id.length === 0 || sessionIds.has(session.id)
      || (session.session !== "race" && session.session !== "sprint") || session.sequenceIndex !== index) {
      return "Remaining sessions require unique IDs, supported kinds, and contiguous sequence indexes.";
    }
    sessionIds.add(session.id);
  }
  if (!Number.isInteger(candidate.nextSessionIndex) || candidate.nextSessionIndex! < 0 || candidate.nextSessionIndex! > candidate.remainingSessions.length) return "The remaining-session position is absent or malformed.";
  return null;
}

/** Every returned prune is a proof over all supported continuations; equality is deliberately kept. */
export function proveStateCannotWin(state: FutureChampionshipState, contenderId: string): PruningProof {
  const malformed = malformedReason(state);
  if (malformed) return keep(malformed);
  const contender = state.standings.find((standing) => standing.competitorId === contenderId);
  if (!contender) return keep("The contender is absent from the supplied competitor state.");
  const remaining = state.remainingSessions.slice(state.nextSessionIndex);

  if (remaining.length === 0) {
    const blocker = state.standings.find((rival) => rival.competitorId !== contenderId && compareStandings(contender, rival).outcome !== "ahead");
    return blocker
      ? { pruned: true, rule: "TERMINAL_NOT_STRICT_CHAMPION", contenderId, blockingRivalId: blocker.competitorId, comparison: compareStandings(contender, blocker) }
      : keep("The contender is already the strict terminal champion.");
  }

  const maximumAdditionalPoints = remaining.reduce((total, { session }) => total + SESSION_MAXIMUM[state.kind][session], 0);
  const ceiling = contender.points + maximumAdditionalPoints;
  const rival = state.standings.find((standing) => standing.competitorId !== contenderId && ceiling < standing.points);
  return rival
    ? { pruned: true, rule: "STRICT_POINTS_CEILING", contenderId, rivalId: rival.competitorId, currentPoints: contender.points, maximumAdditionalPoints, ceiling, rivalFloor: rival.points }
    : keep("No rival's current points floor is strictly above the contender's maximum points ceiling.");
}

export type SessionType = "race" | "sprint";
export type ResultStatus = "FINISHED" | "DNF" | "DNS";

export interface EventEntrant {
  readonly driverId: string;
  readonly constructorId: string;
}

export interface EventResultInput {
  readonly driverId: string;
  readonly position: number | null;
  readonly status: ResultStatus;
}

export interface ScoredEventResult extends EventResultInput {
  readonly constructorId: string;
  readonly awardedPoints: number;
}

export interface OfficialEventResultInput extends EventResultInput {
  readonly awardedPoints: number;
}

export type EventOutcomeValidationCode =
  | "DUPLICATE_ROSTER_ENTRANT"
  | "DUPLICATE_ENTRANT"
  | "UNKNOWN_ENTRANT"
  | "MISSING_ENTRANT"
  | "INVALID_POSITION"
  | "DUPLICATE_POSITION"
  | "NON_CONTIGUOUS_POSITIONS"
  | "FINISHER_WITHOUT_POSITION"
  | "DNS_WITH_POSITION"
  | "AWARDED_POINTS_MISMATCH";

export class EventOutcomeValidationError extends Error {
  constructor(
    public readonly code: EventOutcomeValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "EventOutcomeValidationError";
  }
}

const FULL_POINTS: Readonly<Record<SessionType, readonly number[]>> = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [8, 7, 6, 5, 4, 3, 2, 1],
};

function pointsForPosition(session: SessionType, position: number | null): number {
  if (position === null) {
    return 0;
  }

  return FULL_POINTS[session][position - 1] ?? 0;
}

function buildEntrantMap(entrants: readonly EventEntrant[]): ReadonlyMap<string, EventEntrant> {
  const entrantMap = new Map<string, EventEntrant>();

  for (const entrant of entrants) {
    if (entrantMap.has(entrant.driverId)) {
      throw new EventOutcomeValidationError(
        "DUPLICATE_ROSTER_ENTRANT",
        `The entrant roster contains ${entrant.driverId} more than once.`,
      );
    }
    entrantMap.set(entrant.driverId, entrant);
  }

  return entrantMap;
}

function validateEntrants(
  entrantMap: ReadonlyMap<string, EventEntrant>,
  results: readonly EventResultInput[],
): void {
  const seen = new Set<string>();

  for (const result of results) {
    if (seen.has(result.driverId)) {
      throw new EventOutcomeValidationError(
        "DUPLICATE_ENTRANT",
        `The result contains ${result.driverId} more than once.`,
      );
    }
    seen.add(result.driverId);

    if (!entrantMap.has(result.driverId)) {
      throw new EventOutcomeValidationError(
        "UNKNOWN_ENTRANT",
        `${result.driverId} is not in this event's entrant roster.`,
      );
    }
  }

  const missing = [...entrantMap.keys()].filter((driverId) => !seen.has(driverId));
  if (missing.length > 0) {
    throw new EventOutcomeValidationError(
      "MISSING_ENTRANT",
      `The result is missing: ${missing.join(", ")}.`,
    );
  }
}

function validateClassifications(
  entrantCount: number,
  results: readonly EventResultInput[],
): void {
  const positions = new Set<number>();

  for (const result of results) {
    if (result.status === "FINISHED" && result.position === null) {
      throw new EventOutcomeValidationError(
        "FINISHER_WITHOUT_POSITION",
        `${result.driverId} is marked FINISHED without a classified position.`,
      );
    }
    if (result.status === "DNS" && result.position !== null) {
      throw new EventOutcomeValidationError(
        "DNS_WITH_POSITION",
        `${result.driverId} is marked DNS but has classified position ${result.position}.`,
      );
    }
    if (result.position === null) {
      continue;
    }
    if (!Number.isInteger(result.position) || result.position < 1 || result.position > entrantCount) {
      throw new EventOutcomeValidationError(
        "INVALID_POSITION",
        `${result.driverId} has invalid classified position ${result.position}.`,
      );
    }
    if (positions.has(result.position)) {
      throw new EventOutcomeValidationError(
        "DUPLICATE_POSITION",
        `Classified position ${result.position} is used more than once.`,
      );
    }
    positions.add(result.position);
  }

  for (let position = 1; position <= positions.size; position += 1) {
    if (!positions.has(position)) {
      throw new EventOutcomeValidationError(
        "NON_CONTIGUOUS_POSITIONS",
        `Classified positions must run from 1 through ${positions.size} without gaps.`,
      );
    }
  }
}

export function scoreAndValidateEvent(
  session: SessionType,
  entrants: readonly EventEntrant[],
  results: readonly EventResultInput[],
): readonly ScoredEventResult[] {
  const entrantMap = buildEntrantMap(entrants);
  validateEntrants(entrantMap, results);
  validateClassifications(entrants.length, results);

  return results.map((result) => ({
    ...result,
    constructorId: entrantMap.get(result.driverId)!.constructorId,
    awardedPoints: pointsForPosition(session, result.position),
  }));
}

export function validateOfficialEvent(
  session: SessionType,
  entrants: readonly EventEntrant[],
  results: readonly OfficialEventResultInput[],
): readonly ScoredEventResult[] {
  const scored = scoreAndValidateEvent(session, entrants, results);

  for (let index = 0; index < results.length; index += 1) {
    const official = results[index];
    const expected = scored[index];
    if (official.awardedPoints !== expected.awardedPoints) {
      throw new EventOutcomeValidationError(
        "AWARDED_POINTS_MISMATCH",
        `${official.driverId} has ${official.awardedPoints} awarded points; the supported full-points classification requires ${expected.awardedPoints}.`,
      );
    }
  }

  return results.map((result, index) => ({
    ...result,
    constructorId: scored[index].constructorId,
  }));
}

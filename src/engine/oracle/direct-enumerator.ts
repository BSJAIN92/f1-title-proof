import {
  scoreAndValidateEvent,
  type EventEntrant,
  type EventResultInput,
  type ResultStatus,
  type ScoredEventResult,
  type SessionType,
} from "../events/event-outcome";
import {
  accumulateStandings,
  compareStandings,
  type ChampionshipKind,
  type ChampionshipStanding,
  type QualifyingResult,
  type ScoredChampionshipEvent,
} from "../standings/championship-standings";

const MAX_TINY_ENTRANTS = 4;
const MAX_TINY_EVENTS = 2;

export interface TinyFutureEvent {
  readonly id: string;
  readonly session: SessionType;
  readonly entrants: readonly EventEntrant[];
  readonly allowedResults?: Readonly<Record<string, readonly TinyResultChoice[]>>;
}

export interface TinyResultChoice {
  readonly position: number | null;
  readonly status: ResultStatus;
}

export interface EnumeratedEventOutcome {
  readonly id: string;
  readonly session: SessionType;
  readonly results: readonly ScoredEventResult[];
}

export interface WinningRawOutcome {
  readonly id: string;
  readonly events: readonly EnumeratedEventOutcome[];
}

export interface TinyChampionshipQuestion {
  readonly kind: ChampionshipKind;
  readonly contenderId: string;
  readonly initialStandings?: readonly ChampionshipStanding[];
  readonly completedEvents?: readonly ScoredChampionshipEvent[];
  readonly qualifyingResults?: readonly QualifyingResult[];
  readonly futureEvents: readonly TinyFutureEvent[];
}

function addInitialStandings(initial: readonly ChampionshipStanding[] | undefined, future: readonly ChampionshipStanding[]): readonly ChampionshipStanding[] {
  const ids = new Set([...(initial ?? []).map((x) => x.competitorId), ...future.map((x) => x.competitorId)]);
  return [...ids].map((competitorId) => {
    const left=initial?.find((x)=>x.competitorId===competitorId), right=future.find((x)=>x.competitorId===competitorId);
    const merge=(a:Readonly<Record<number,number>>={},b:Readonly<Record<number,number>>={})=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map((key)=>[key,(a[Number(key)]??0)+(b[Number(key)]??0)]));
    return {competitorId,points:(left?.points??0)+(right?.points??0),racePositions:merge(left?.racePositions,right?.racePositions),qualifyingPositions:merge(left?.qualifyingPositions,right?.qualifyingPositions)};
  }).sort((a,b)=>a.competitorId.localeCompare(b.competitorId));
}

export function accumulateTinyPathStandings(question: TinyChampionshipQuestion, events: readonly EnumeratedEventOutcome[]): readonly ChampionshipStanding[] {
  return addInitialStandings(question.initialStandings, accumulateStandings(question.kind,[...(question.completedEvents??[]),...events.map(({session,results})=>({session,results}))],question.qualifyingResults));
}

function resultKey(result: EventResultInput): string {
  return result.position === null
    ? `${result.driverId}:${result.status}`
    : `${result.driverId}:P${result.position}-${result.status}`;
}

function allowed(fixture: TinyFutureEvent, result: EventResultInput): boolean {
  const choices = fixture.allowedResults?.[result.driverId];
  return !choices || choices.some((choice) => choice.position === result.position && choice.status === result.status);
}

function permutations<T>(values: readonly T[]): readonly (readonly T[])[] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]),
  );
}

function subsets<T>(values: readonly T[]): readonly (readonly T[])[] {
  return values.reduce<readonly (readonly T[])[]>(
    (sets, value) => [...sets, ...sets.map((set) => [...set, value])],
    [[]],
  );
}

function statusAssignments(count: number): readonly (readonly ResultStatus[])[] {
  if (count === 0) return [[]];
  return statusAssignments(count - 1).flatMap((rest) => [
    [...rest, "FINISHED" as const],
    [...rest, "DNF" as const],
  ]);
}

function unclassifiedAssignments(count: number): readonly (readonly ResultStatus[])[] {
  if (count === 0) return [[]];
  return unclassifiedAssignments(count - 1).flatMap((rest) => [
    [...rest, "DNF" as const],
    [...rest, "DNS" as const],
  ]);
}

export function enumerateEventOutcomes(fixture: TinyFutureEvent): readonly EnumeratedEventOutcome[] {
  if (fixture.entrants.length > MAX_TINY_ENTRANTS) {
    throw new Error(`The direct enumerator supports at most ${MAX_TINY_ENTRANTS} entrants.`);
  }
  const driverIds = fixture.entrants.map(({ driverId }) => driverId);
  const outcomes: EnumeratedEventOutcome[] = [];

  for (const classifiedSet of subsets(driverIds)) {
    for (const order of permutations(classifiedSet)) {
      const unclassified = driverIds.filter((driverId) => !classifiedSet.includes(driverId));
      for (const classifiedStatuses of statusAssignments(order.length)) {
        for (const unclassifiedStatuses of unclassifiedAssignments(unclassified.length)) {
          const byDriver = new Map<string, EventResultInput>();
          order.forEach((driverId, index) => byDriver.set(driverId, {
            driverId,
            position: index + 1,
            status: classifiedStatuses[index],
          }));
          unclassified.forEach((driverId, index) => byDriver.set(driverId, {
            driverId,
            position: null,
            status: unclassifiedStatuses[index],
          }));
          const inputs = driverIds.map((driverId) => byDriver.get(driverId)!);
          if (!inputs.every((result) => allowed(fixture, result))) continue;
          const results = scoreAndValidateEvent(fixture.session, fixture.entrants, inputs);
          outcomes.push({
            id: `${fixture.id}[${inputs.map(resultKey).join("|")}]`,
            session: fixture.session,
            results,
          });
        }
      }
    }
  }
  return outcomes.sort((left, right) => left.id.localeCompare(right.id));
}

function continuations(events: readonly TinyFutureEvent[]): readonly (readonly EnumeratedEventOutcome[])[] {
  if (events.length === 0) return [[]];
  const [first, ...rest] = events;
  return enumerateEventOutcomes(first).flatMap((outcome) =>
    continuations(rest).map((tail) => [outcome, ...tail]),
  );
}

export function enumerateWinningRawOutcomes(question: TinyChampionshipQuestion): readonly WinningRawOutcome[] {
  if (question.futureEvents.length > MAX_TINY_EVENTS) {
    throw new Error(`The direct enumerator supports at most ${MAX_TINY_EVENTS} future events.`);
  }
  const wins: WinningRawOutcome[] = [];
  for (const continuation of continuations(question.futureEvents)) {
    const standings = accumulateTinyPathStandings(question,continuation);
    const contender = standings.find(({ competitorId }) => competitorId === question.contenderId);
    if (!contender) continue;
    const rivals = standings.filter(({ competitorId }) => competitorId !== question.contenderId);
    if (rivals.length > 0 && rivals.every((rival) => compareStandings(contender, rival).outcome === "ahead")) {
      wins.push({ id: continuation.map(({ id }) => id).join("+"), events: continuation });
    }
  }
  return wins.sort((left, right) => left.id.localeCompare(right.id));
}

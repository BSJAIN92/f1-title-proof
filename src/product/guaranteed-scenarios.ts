import { createHash } from "node:crypto";
import type { VerifiedFrozenDriverSnapshot } from "../engine/relations/verified-frozen-driver-snapshot";
import type { ChampionshipKind } from "./frozen-product-data";

const POINTS = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [8, 7, 6, 5, 4, 3, 2, 1],
} as const;
const PAGE_SIZE = 25;

export interface GuaranteedScenarioRequest {
  readonly kind: ChampionshipKind;
  readonly contenderId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly cursor?: string;
}

export interface FinishSummary {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly pointsEach: number;
}

export interface GuaranteedScenario {
  readonly key: string;
  readonly additionalPoints: number;
  readonly finalPoints: number;
  readonly races: readonly FinishSummary[];
  readonly sprint: { readonly key: string; readonly label: string; readonly points: number };
}

export interface GuaranteedScenarioPage {
  readonly kind: ChampionshipKind;
  readonly contenderId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly currentPoints: number;
  readonly strongestRivalId: string;
  readonly strongestRivalPoints: number;
  readonly items: readonly GuaranteedScenario[];
  readonly nextCursor: string | null;
}

export type GuaranteedScenarioResponse = GuaranteedScenarioPage | { readonly status: "ERROR"; readonly reason: string };

interface Outcome {
  readonly key: string;
  readonly label: string;
  readonly points: number;
  readonly rivalMaximum: number;
}

const positionKey = (position: number | null) => position === null ? "00" : String(position).padStart(2, "0");
const positionLabel = (position: number | null) => position === null ? "0 points" : `P${position}`;

function driverOutcomes(session: "race" | "sprint"): readonly Outcome[] {
  const scores = POINTS[session];
  return [...scores.map((points, index) => {
    const position = index + 1;
    const rivalMaximum = position === 1 ? scores[1] : scores[0];
    return { key: positionKey(position), label: positionLabel(position), points, rivalMaximum };
  }), { key: "00", label: "0 points", points: 0, rivalMaximum: scores[0] }].sort((a, b) => a.key.localeCompare(b.key));
}

function constructorOutcomes(session: "race" | "sprint"): readonly Outcome[] {
  const scores = POINTS[session];
  const finishes = [...scores.map((points, index) => ({ position: index + 1, points })), { position: null, points: 0 }];
  const outcomes: Outcome[] = [];
  for (let left = 0; left < finishes.length; left += 1) {
    for (let right = left; right < finishes.length; right += 1) {
      const a = finishes[left], b = finishes[right];
      if (a.position !== null && a.position === b.position) continue;
      const occupied = new Set([a.position, b.position].filter((value): value is number => value !== null));
      const available = scores.filter((_, index) => !occupied.has(index + 1));
      outcomes.push({
        key: `${positionKey(a.position)}+${positionKey(b.position)}`,
        label: `${positionLabel(a.position)} + ${positionLabel(b.position)}`,
        points: a.points + b.points,
        rivalMaximum: available[0] + available[1],
      });
    }
  }
  return outcomes.sort((a, b) => a.key.localeCompare(b.key));
}

export const scenarioOutcomes = (kind: ChampionshipKind, session: "race" | "sprint") =>
  kind === "driver" ? driverOutcomes(session) : constructorOutcomes(session);

function cursorBinding(request: GuaranteedScenarioRequest): string {
  return createHash("sha256").update(`${request.kind}\0${request.contenderId}\0${request.dataVersion}\0${request.ruleVersion}`).digest("base64url").slice(0, 16);
}

interface CursorState { readonly points: number; readonly sprint: number; readonly rank: bigint }

function encodeCursor(binding: string, state: CursorState): string {
  return Buffer.from(JSON.stringify({ binding, points:state.points, sprint:state.sprint, rank:state.rank.toString() }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined, binding: string): CursorState | null {
  if (value === undefined) return { points:0, sprint:0, rank:0n };
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const item = parsed as Record<string, unknown>;
    if (item.binding !== binding || !Number.isSafeInteger(item.points) || (item.points as number) < 0 || !Number.isSafeInteger(item.sprint) || (item.sprint as number) < 0 || typeof item.rank !== "string" || !/^(0|[1-9]\d*)$/.test(item.rank)) return null;
    return { points:item.points as number, sprint:item.sprint as number, rank:BigInt(item.rank) };
  } catch { return null; }
}

function createCounter(outcomes: readonly Outcome[]) {
  const memo = new Map<string, bigint>();
  const pointsMemo = new Map<string, bigint>();
  const suffix = outcomes.map((_, start) => {
    const remaining = outcomes.slice(start);
    return {
      minimumPoints: Math.min(...remaining.map(item => item.points)),
      maximumPoints: Math.max(...remaining.map(item => item.points)),
      minimumMargin: Math.min(...remaining.map(item => item.points - item.rivalMaximum)),
      maximumMargin: Math.max(...remaining.map(item => item.points - item.rivalMaximum)),
    };
  });
  function countPoints(start: number, remaining: number, points: number): bigint {
    if (remaining === 0) return points === 0 ? 1n : 0n;
    if (points < 0 || start >= outcomes.length || points < remaining * suffix[start].minimumPoints || points > remaining * suffix[start].maximumPoints) return 0n;
    const key = `${start}:${remaining}:${points}`;
    const cached = pointsMemo.get(key);
    if (cached !== undefined) return cached;
    let total = 0n;
    for (let index = start; index < outcomes.length; index += 1) total += countPoints(index, remaining - 1, points - outcomes[index].points);
    pointsMemo.set(key, total);
    return total;
  }
  function count(start: number, remaining: number, points: number, marginFloor: number): bigint {
    if (remaining === 0) return points === 0 && 0 > marginFloor ? 1n : 0n;
    if (points < 0 || start >= outcomes.length || points < remaining * suffix[start].minimumPoints || points > remaining * suffix[start].maximumPoints || remaining * suffix[start].maximumMargin <= marginFloor) return 0n;
    if (remaining * suffix[start].minimumMargin > marginFloor) return countPoints(start, remaining, points);
    const key = `${start}:${remaining}:${points}:${marginFloor}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let total = 0n;
    for (let index = start; index < outcomes.length; index += 1) {
      const outcome = outcomes[index];
      total += count(index, remaining - 1, points - outcome.points, marginFloor - (outcome.points - outcome.rivalMaximum));
    }
    memo.set(key, total);
    return total;
  }
  function unrank(remaining: number, points: number, marginFloor: number, rank: bigint): number[] | null {
    const picked: number[] = [];
    let start = 0;
    while (remaining > 0) {
      let found = false;
      for (let index = start; index < outcomes.length; index += 1) {
        const outcome = outcomes[index];
        const size = count(index, remaining - 1, points - outcome.points, marginFloor - (outcome.points - outcome.rivalMaximum));
        if (rank >= size) { rank -= size; continue; }
        picked.push(index);
        start = index;
        remaining -= 1;
        points -= outcome.points;
        marginFloor -= outcome.points - outcome.rivalMaximum;
        found = true;
        break;
      }
      if (!found) return null;
    }
    return points === 0 && 0 > marginFloor ? picked : null;
  }
  return { count, unrank };
}

function groupedFinishes(indices: readonly number[], outcomes: readonly Outcome[]): FinishSummary[] {
  const groups: FinishSummary[] = [];
  for (const index of indices) {
    const outcome = outcomes[index], previous = groups.at(-1);
    if (previous?.key === outcome.key) groups[groups.length - 1] = { ...previous, count: previous.count + 1 };
    else groups.push({ key: outcome.key, label: outcome.label, count: 1, pointsEach: outcome.points });
  }
  return groups;
}

export function calculateGuaranteedScenarioPage(snapshot: VerifiedFrozenDriverSnapshot, request: GuaranteedScenarioRequest): GuaranteedScenarioResponse {
  if (request.dataVersion !== snapshot.dataVersion || request.ruleVersion !== snapshot.ruleVersion) return { status: "ERROR", reason: "The scenario request uses stale championship data." };
  const standings = request.kind === "driver"
    ? snapshot.standings.map(row => ({ id: row.driverId, position: row.position, points: row.points }))
    : snapshot.constructorStandings.map(row => ({ id: row.constructorId, position: row.position, points: row.points }));
  const visibleLimit = request.kind === "driver" ? 6 : 3;
  const contender = standings.find(row => row.id === request.contenderId);
  if (!contender || contender.position > visibleLimit) return { status: "ERROR", reason: `Choose a top-${visibleLimit} ${request.kind}.` };
  const rivals = standings.filter(row => row.id !== contender.id);
  const strongestRival = rivals.reduce((best, row) => row.points > best.points ? row : best);
  const currentGap = contender.points - strongestRival.points;
  const raceCount = snapshot.sessions.filter(session => session.session === "race").length;
  const sprintCount = snapshot.sessions.filter(session => session.session === "sprint").length;
  if (sprintCount !== 1) return { status: "ERROR", reason: "This scenarios page currently requires exactly one remaining Sprint." };

  const raceOutcomes = scenarioOutcomes(request.kind, "race");
  const sprintOutcomes = scenarioOutcomes(request.kind, "sprint");
  const counter = createCounter(raceOutcomes);
  const maximumPoints = raceCount * (request.kind === "driver" ? 25 : 43) + (request.kind === "driver" ? 8 : 15);
  const counts = new Map<string, bigint>();
  const countFor = (totalPoints: number, sprintIndex: number) => {
    const key = `${totalPoints}:${sprintIndex}`;
    const cached = counts.get(key);
    if (cached !== undefined) return cached;
    const sprint = sprintOutcomes[sprintIndex];
    const racePoints = totalPoints - sprint.points;
    const floor = -currentGap - (sprint.points - sprint.rivalMaximum);
    const value = racePoints < 0 ? 0n : counter.count(0, raceCount, racePoints, floor);
    counts.set(key, value);
    return value;
  };

  const binding = cursorBinding(request);
  const cursor = decodeCursor(request.cursor, binding);
  if (cursor === null || cursor.points > maximumPoints || cursor.sprint >= sprintOutcomes.length) return { status: "ERROR", reason: "The scenario page cursor is invalid or belongs to another selection." };

  const generated: { item:GuaranteedScenario; cursor:CursorState }[] = [];
  outer: for (let points = cursor.points; points <= maximumPoints; points += 1) {
    for (let sprintIndex = points === cursor.points ? cursor.sprint : 0; sprintIndex < sprintOutcomes.length; sprintIndex += 1) {
      const size = countFor(points, sprintIndex);
      let localRank = points === cursor.points && sprintIndex === cursor.sprint ? cursor.rank : 0n;
      if (localRank > size) return { status: "ERROR", reason: "The scenario page cursor is outside the available results." };
      while (localRank < size && generated.length <= PAGE_SIZE) {
        const sprint = sprintOutcomes[sprintIndex];
        const indices = counter.unrank(raceCount, points - sprint.points, -currentGap - (sprint.points - sprint.rivalMaximum), localRank);
        if (!indices) return { status: "ERROR", reason: "The scenario page could not be generated." };
        const races = groupedFinishes(indices, raceOutcomes);
        generated.push({ item:{
          key: `${points}:${sprint.key}:${races.map(group => `${group.key}x${group.count}`).join(",")}`,
          additionalPoints: points,
          finalPoints: contender.points + points,
          races,
          sprint: { key: sprint.key, label: sprint.label, points: sprint.points },
        }, cursor:{points,sprint:sprintIndex,rank:localRank} });
        localRank += 1n;
      }
      if (generated.length > PAGE_SIZE) break outer;
    }
  }
  const hasMore = generated.length > PAGE_SIZE;
  const items = generated.slice(0, PAGE_SIZE).map(entry => entry.item);
  return {
    kind: request.kind,
    contenderId: request.contenderId,
    dataVersion: request.dataVersion,
    ruleVersion: request.ruleVersion,
    currentPoints: contender.points,
    strongestRivalId: strongestRival.id,
    strongestRivalPoints: strongestRival.points,
    items,
    nextCursor: hasMore ? encodeCursor(binding, generated[PAGE_SIZE].cursor) : null,
  };
}

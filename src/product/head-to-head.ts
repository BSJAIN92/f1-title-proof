import type { VerifiedFrozenDriverSnapshot } from "../engine/relations/verified-frozen-driver-snapshot";
import type { ChampionshipKind } from "./frozen-product-data";

export interface HeadToHeadRequest { kind: ChampionshipKind; targetId: string; rivalId: string; dataVersion: string; ruleVersion: string }
export interface HeadToHeadExample { title: string; finalMargin: number; events: readonly string[] }
export interface HeadToHeadResult {
  status: "COMPLETE"; kind: ChampionshipKind; targetId: string; rivalId: string; dataVersion: string; ruleVersion: string;
  targetPoints: number; rivalPoints: number; currentGap: number; requiredRemainingDifference: number; rule: string;
  examples: readonly HeadToHeadExample[];
}
export type HeadToHeadResponse = HeadToHeadResult | { status: "ERROR"; reason: string };

type PairOutcome = { delta: number; label: string };
const DRIVER_POINTS = { race: [25,18,15,12,10,8,6,4,2,1], sprint: [8,7,6,5,4,3,2,1] } as const;

function driverOutcomes(session: "race" | "sprint", target: string, rival: string): PairOutcome[] {
  const points = DRIVER_POINTS[session];
  const finishes = [...points.map((value, index) => ({ position: index + 1, value })), { position: null, value: 0 }];
  return finishes.flatMap((a) => finishes.filter((b) => a.position === null || b.position === null || a.position !== b.position).map((b) => ({
    delta: a.value - b.value,
    label: `${target}: ${a.position ? `P${a.position}` : "no points"} (${a.value}) · ${rival}: ${b.position ? `P${b.position}` : "no points"} (${b.value})`,
  })));
}

function teamScores(session: "race" | "sprint"): { score: number; positions: readonly (number | null)[] }[] {
  const points = DRIVER_POINTS[session];
  const positions = [...points.map((value, index) => ({ position: index + 1, value })), { position: null, value: 0 }];
  const byScore = new Map<number, { score: number; positions: readonly (number | null)[] }>();
  for (const a of positions) for (const b of positions) {
    if (a.position !== null && a.position === b.position) continue;
    const score = a.value + b.value;
    if (!byScore.has(score)) byScore.set(score, { score, positions: [a.position, b.position] });
  }
  return [...byScore.values()];
}

function teamOutcomes(session: "race" | "sprint", target: string, rival: string): PairOutcome[] {
  const scores = teamScores(session), byDelta = new Map<number, PairOutcome>();
  for (const a of scores) for (const b of scores) {
    const used = new Set(a.positions.filter((x): x is number => x !== null));
    if (b.positions.some((x) => x !== null && used.has(x))) continue;
    const fmt = (positions: readonly (number | null)[]) => positions.map((x) => x ? `P${x}` : "no points").join(" + ");
    const outcome = { delta: a.score - b.score, label: `${target}: ${fmt(a.positions)} (${a.score}) · ${rival}: ${fmt(b.positions)} (${b.score})` };
    if (!byDelta.has(outcome.delta)) byDelta.set(outcome.delta, outcome);
  }
  return [...byDelta.values()];
}

function examples(snapshot: VerifiedFrozenDriverSnapshot, kind: ChampionshipKind, target: string, rival: string, currentGap: number): HeadToHeadExample[] {
  let states = new Map<number, readonly string[]>([[0, []]]);
  for (const session of snapshot.sessions) {
    const outcomes = kind === "driver" ? driverOutcomes(session.session, target, rival) : teamOutcomes(session.session, target, rival);
    const next = new Map<number, readonly string[]>();
    for (const [delta, path] of states) for (const outcome of outcomes) if (!next.has(delta + outcome.delta)) {
      next.set(delta + outcome.delta, [...path, `${session.id} — ${outcome.label}`]);
    }
    states = next;
  }
  const wins = [...states.keys()].filter((delta) => currentGap + delta > 0).sort((a,b) => a-b);
  if (!wins.length) return [];
  const picks = [...new Set([wins[0], wins[Math.floor((wins.length-1)/2)], wins[wins.length-1]])];
  return picks.map((delta, index) => ({ title: index === 0 ? "Closest points win" : index === picks.length - 1 ? "Maximum advantage" : "Stronger winning margin", finalMargin: currentGap + delta, events: states.get(delta)! }));
}

export function calculateHeadToHead(snapshot: VerifiedFrozenDriverSnapshot, request: HeadToHeadRequest): HeadToHeadResponse {
  if (request.dataVersion !== snapshot.dataVersion || request.ruleVersion !== snapshot.ruleVersion) return { status: "ERROR", reason: "The comparison uses stale championship data." };
  if (request.targetId === request.rivalId) return { status: "ERROR", reason: "Choose two different competitors." };
  const rows = request.kind === "driver" ? snapshot.standings.map((x) => ({ id: x.driverId, points: x.points })) : snapshot.constructorStandings.map((x) => ({ id: x.constructorId, points: x.points }));
  const target = rows.find((x) => x.id === request.targetId), rival = rows.find((x) => x.id === request.rivalId);
  if (!target || !rival) return { status: "ERROR", reason: "Both competitors must be in the approved standings." };
  const currentGap = target.points - rival.points;
  const requiredRemainingDifference = 1 - currentGap;
  return { status: "COMPLETE", ...request, targetPoints: target.points, rivalPoints: rival.points, currentGap, requiredRemainingDifference,
    rule: `${request.targetId}'s remaining points minus ${request.rivalId}'s remaining points must be at least ${requiredRemainingDifference}.`,
    examples: examples(snapshot, request.kind, request.targetId, request.rivalId, currentGap) };
}

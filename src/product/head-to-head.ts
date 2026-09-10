import type { VerifiedFrozenDriverSnapshot } from "../engine/relations/verified-frozen-driver-snapshot";
import type { ChampionshipKind } from "./frozen-product-data";

export interface HeadToHeadRequest { kind: ChampionshipKind; targetId: string; rivalId: string; dataVersion: string; ruleVersion: string }
export interface HeadToHeadExample { title: string; finalMargin: number | null; events: readonly string[]; note: string; unavailableReason?: string }
export interface HeadToHeadResult {
  status: "COMPLETE"; kind: ChampionshipKind; targetId: string; rivalId: string; dataVersion: string; ruleVersion: string;
  targetPoints: number; rivalPoints: number; currentGap: number; requiredRemainingDifference: number; rule: string;
  examples: readonly HeadToHeadExample[];
}
export type HeadToHeadResponse = HeadToHeadResult | { status: "ERROR"; reason: string };

type PairOutcome = { delta: number; label: string };
type Path = { deltas: readonly number[]; events: readonly string[] };
const DRIVER_POINTS = { race: [25,18,15,12,10,8,6,4,2,1], sprint: [8,7,6,5,4,3,2,1] } as const;

function driverOutcomes(session: "race" | "sprint", target: string, rival: string): PairOutcome[] {
  const points = DRIVER_POINTS[session];
  const finishes = [...points.map((value, index) => ({ position: index + 1, value })), { position: null, value: 0 }];
  return finishes.flatMap((a) => finishes.filter((b) => a.position === null || b.position === null || a.position !== b.position).map((b) => ({
    delta: a.value - b.value,
    label: `${target}: ${a.position ? `P${a.position}` : session === "race" ? "P11+" : "P9+"} (${a.value}) · ${rival}: ${b.position ? `P${b.position}` : session === "race" ? "P11+" : "P9+"} (${b.value})`,
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
    const fmt = (positions: readonly (number | null)[]) => positions.map((x) => x ? `P${x}` : session === "race" ? "P11+" : "P9+").join(" + ");
    const outcome = { delta: a.score - b.score, label: `${target}: ${fmt(a.positions)} (${a.score}) · ${rival}: ${fmt(b.positions)} (${b.score})` };
    if (!byDelta.has(outcome.delta)) byDelta.set(outcome.delta, outcome);
  }
  return [...byDelta.values()];
}

function maximumSwing(session:"race"|"sprint",kind:ChampionshipKind){return kind==="driver"?(session==="race"?25:8):(session==="race"?43:15)}
function eventLabel(sessionId:string,outcome:PairOutcome){return `${sessionId} — ${outcome.label}`}
function quickestOutcome(session:"race"|"sprint",kind:ChampionshipKind,target:string,rival:string):PairOutcome{
  if(kind==="driver"){const points=DRIVER_POINTS[session];return{delta:points[0]-points[1],label:`${target}: P1 (${points[0]}) · ${rival}: P2 (${points[1]})`}}
  const targetPoints=session==="race"?43:15,rivalPoints=session==="race"?22:11;
  return{delta:targetPoints-rivalPoints,label:`${target}: P1 + P2 (${targetPoints}) · ${rival}: P3 + P4 (${rivalPoints})`}
}
function securedIndex(snapshot:VerifiedFrozenDriverSnapshot,kind:ChampionshipKind,currentGap:number,deltas:readonly number[]):number|null{
  let gap=currentGap;
  for(let index=0;index<deltas.length;index+=1){gap+=deltas[index];const remaining=snapshot.sessions.slice(index+1).reduce((sum,item)=>sum+maximumSwing(item.session,kind),0);if(gap>remaining)return index}
  return null
}
function timingLabel(sessionId:string){const parts=sessionId.split(":"),date=parts.shift()??"",session=parts.pop()??"",venue=parts.join(":");return `${session==="sprint"?"sprint":"race"} at ${venue} on ${date}`}
function examples(snapshot: VerifiedFrozenDriverSnapshot, kind: ChampionshipKind, target: string, rival: string, currentGap: number): HeadToHeadExample[] {
  let states = new Map<number, Path>([[0, {deltas:[],events:[]}]]),undecided=new Map<number,Path>([[0,{deltas:[],events:[]}]]);
  for (const session of snapshot.sessions) {
    const outcomes = kind === "driver" ? driverOutcomes(session.session, target, rival) : teamOutcomes(session.session, target, rival);
    const next = new Map<number, Path>();
    for (const [delta, path] of states) for (const outcome of outcomes) if (!next.has(delta + outcome.delta)) {
      next.set(delta + outcome.delta, {deltas:[...path.deltas,outcome.delta],events:[...path.events,eventLabel(session.id,outcome)]});
    }
    states = next;
  }
  const wins = [...states.keys()].filter((delta) => currentGap + delta > 0).sort((a,b) => a-b);
  if (!wins.length) return [];
  for(let index=0;index<snapshot.sessions.length;index+=1){const session=snapshot.sessions[index],outcomes=kind==="driver"?driverOutcomes(session.session,target,rival):teamOutcomes(session.session,target,rival),next=new Map<number,Path>(),remaining=snapshot.sessions.slice(index+1).reduce((sum,item)=>sum+maximumSwing(item.session,kind),0),last=index===snapshot.sessions.length-1;for(const[delta,path]of undecided)for(const outcome of outcomes){const total=delta+outcome.delta;if(!last&&currentGap+total>remaining)continue;if(!next.has(total))next.set(total,{deltas:[...path.deltas,outcome.delta],events:[...path.events,eventLabel(session.id,outcome)]})}undecided=next}
  const slowWins=[...undecided.keys()].filter(delta=>currentGap+delta>0).sort((a,b)=>a-b),slowDelta=slowWins[0]??wins[0],slowPath=undecided.get(slowDelta)??states.get(slowDelta)!;
  const quickDeltas:number[]=[],quickEvents:string[]=[];for(const session of snapshot.sessions){const outcome=quickestOutcome(session.session,kind,target,rival);quickDeltas.push(outcome.delta);quickEvents.push(eventLabel(session.id,outcome))}const quickPath:Path={deltas:quickDeltas,events:quickEvents};
  const quickMargin=currentGap+quickPath.deltas.reduce((sum,delta)=>sum+delta,0),quickIndex=quickMargin>0?securedIndex(snapshot,kind,currentGap,quickPath.deltas):null,lastSession=snapshot.sessions.at(-1)!;
  const closest=states.get(wins[0])!,maximum=states.get(wins.at(-1)!)!;
  return[
    {title:"Closest Points Win",finalMargin:currentGap+wins[0],events:closest.events,note:"The smallest available final winning margin."},
    quickIndex===null?{title:"Quickest",finalMargin:null,events:[],note:"P1/P2 in every remaining session.",unavailableReason:`${target} cannot secure this head-to-head when ${rival} finishes second in every remaining session.`}:{title:"Quickest",finalMargin:quickMargin,events:quickPath.events,note:`Head-to-head secured after the ${timingLabel(snapshot.sessions[quickIndex].id)}.`},
    {title:"Slowest",finalMargin:currentGap+slowDelta,events:slowPath.events,note:`Head-to-head remains undecided until the final ${timingLabel(lastSession.id)}.`},
    {title:"Maximum Points Win",finalMargin:currentGap+wins.at(-1)!,events:maximum.events,note:"The largest available final winning margin."},
  ];
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

import { scoreAndValidateEvent, type EventResultInput, type ResultStatus, type ScoredEventResult, type SessionType } from "../events/event-outcome";
import { classifyExactFinalStandings, createAuthenticatedBoundedGroupingFixture, type GroupId } from "../groups/winning-groups";
import { accumulateTinyPathStandings, enumerateEventOutcomes, enumerateWinningRawOutcomes, type TinyChampionshipQuestion } from "../oracle/direct-enumerator";
import {
  evaluateCompactRuleStandings,
  evaluateFrozenConstructorLayerEquivalence,
  evaluateFrozenDriverLayerEquivalence,
  isGenuineLayeredWinningResult,
  type LayeredWinningResult,
} from "../rules/compact-winning-rule";
import { compareStandings, type ChampionshipStanding } from "../standings/championship-standings";
import {
  evaluateFrozenDriverRelation,
  isGenuineFrozenDriverResult,
  type FrozenDriverSymbolicRelation,
  type FrozenRawPath,
  type FrozenSymbolicResult,
} from "../relations/frozen-driver-symbolic-relation";
import {
  evaluateFrozenConstructorRelation,
  isGenuineFrozenConstructorResult,
  type ConstructorRawPath,
  type ConstructorRelationResult,
  type FrozenConstructorSymbolicRelation,
} from "../relations/frozen-constructor-symbolic-relation";

export const SAMPLE_DISCLAIMER = "Sample only — not complete coverage.";
export const SAMPLE_RULE_VERSION = "labeled-samples-v1";
const MAX_SESSIONS = 12;
const MAX_ENTRANTS = 22;

type Labeled = { readonly label: "SAMPLE" | "BOUNDARY_SAMPLE"; readonly disclaimer: typeof SAMPLE_DISCLAIMER };
type AwardedResult = EventResultInput & { readonly awardedPoints: number };
type SampleSession = { readonly sessionId: string; readonly session: SessionType; readonly results: readonly AwardedResult[] };

export interface PathSample extends Labeled {
  readonly id: string;
  readonly kind: "DRIVER" | "CONSTRUCTOR";
  readonly selectedContenderId: string;
  readonly purpose: "WINNING_WITNESS" | "LOSING_CONTRAST";
  readonly expectedWin: boolean;
  readonly expectedGroup: GroupId | null;
  readonly sessions: readonly SampleSession[];
  readonly evidence: {
    readonly selected: ChampionshipStanding;
    readonly rivals: readonly ChampionshipStanding[];
    readonly finalStandings: readonly ChampionshipStanding[];
    readonly exactRelationAccepted: boolean;
    readonly compactRuleAccepted: boolean;
  };
}

export interface BoundarySample extends Labeled {
  readonly kind: "DRIVER" | "CONSTRUCTOR";
  readonly selectedContenderId: string;
  readonly thresholdId: "POINTS_COMPARISON" | "RACE_COUNTBACK" | "QUALIFYING_FALLBACK";
  readonly side: "BELOW" | "AT" | "ABOVE";
  readonly difference: -1 | 0 | 1;
  readonly expectedGroup: GroupId | null;
  readonly expectedWin: boolean;
  readonly basis: "AUTHENTICATED_M4_RAW_PATH";
  readonly fixtureFingerprint: string;
  readonly question: TinyChampionshipQuestion;
  readonly rawId: string;
  readonly events: readonly { readonly id:string; readonly session:SessionType; readonly results:readonly ScoredEventResult[] }[];
  readonly evidence: { readonly selected: ChampionshipStanding; readonly rival: ChampionshipStanding; readonly finalStandings:readonly ChampionshipStanding[]; readonly comparison: ReturnType<typeof compareStandings>; readonly independentlyEnumeratedAsWinning:boolean };
}

export type SampleAvailability = Labeled & {
  readonly groupId: GroupId;
  readonly status: "UNAVAILABLE";
  readonly reason: "NO_SAFE_BOUNDED_WITNESS";
};

export type SampledLayers = readonly [
  Extract<LayeredWinningResult, { status: "COMPLETE" }>["layers"][0],
  Extract<LayeredWinningResult, { status: "COMPLETE" }>["layers"][1],
  { readonly layer: "LABELED_SAMPLES"; readonly samples: readonly PathSample[]; readonly boundaries: readonly BoundarySample[]; readonly availability: readonly SampleAvailability[] },
];

export type SampledWinningResult =
  | { readonly status: "COMPLETE"; readonly layers: SampledLayers; readonly certificate: Extract<LayeredWinningResult, { status: "COMPLETE" }>["certificate"]; readonly sampleRuleVersion: typeof SAMPLE_RULE_VERSION }
  | { readonly status: "ELIMINATED"; readonly layers: readonly []; readonly reason: string; readonly proof: object }
  | { readonly status: "CALCULATION_FAILURE"; readonly code: "INVALID_M9_RESULT" | "SOURCE_MISMATCH" | "RESOURCE_LIMIT" | "SAMPLE_VERIFICATION_FAILED"; readonly reason: string };

const genuine = new WeakSet<object>();
const verificationContexts = new WeakMap<object, { readonly kind:"DRIVER"|"CONSTRUCTOR"; readonly m9:LayeredWinningResult; readonly relation:FrozenDriverSymbolicRelation|FrozenConstructorSymbolicRelation }>();
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item); Object.freeze(value); } return value; }
function own<T extends SampledWinningResult>(value: T): T { const result = deepFreeze(value); genuine.add(result); return result; }
export function isGenuineSampledWinningResult(value: unknown): value is SampledWinningResult { return !!value && typeof value === "object" && genuine.has(value as object); }
const fail = (code: Extract<SampledWinningResult, { status: "CALCULATION_FAILURE" }>["code"], reason: string) => own({ status: "CALCULATION_FAILURE" as const, code, reason });

function points(session: SessionType, position: number | null): number {
  if (position === null) return 0;
  return (session === "race" ? [25,18,15,12,10,8,6,4,2,1] : [8,7,6,5,4,3,2,1])[position - 1] ?? 0;
}

function statuses(index: number): ResultStatus { return index % 3 === 1 ? "DNF" : "FINISHED"; }

function makeDriverPath(relation: FrozenDriverSymbolicRelation, winning: boolean): FrozenRawPath & { readonly sessions: readonly SampleSession[] } {
  const selected = relation.selectedDriverId;
  const classifiedDnf = relation.initialStandings.filter((x) => x.competitorId !== selected).sort((a,b) => a.points-b.points || a.competitorId.localeCompare(b.competitorId))[0].competitorId;
  const lossWinner = relation.initialStandings.filter((x) => x.competitorId !== selected).sort((a,b) => b.points-a.points || a.competitorId.localeCompare(b.competitorId))[0].competitorId;
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map((event, eventIndex) => {
      const ordered = [...relation.roster].sort((a,b) => a.driverId.localeCompare(b.driverId));
      const results: AwardedResult[] = ordered.map(({ driverId }, index) => {
        if (driverId === selected) { const position = winning ? 1 : null; return { driverId, position, status: winning ? "FINISHED" : "DNS", awardedPoints: points(event.session, position) }; }
        if (winning) {
          if (driverId === classifiedDnf) return { driverId, position: 2, status: "DNF", awardedPoints: points(event.session, 2) };
          if (index % 4 === eventIndex % 4) return { driverId, position: null, status: "DNS", awardedPoints: 0 };
          if (index % 4 === (eventIndex + 1) % 4) return { driverId, position: null, status: "DNF", awardedPoints: 0 };
          return { driverId, position: null, status: "DNS", awardedPoints: 0 };
        }
        const position = driverId === lossWinner ? 1 : null;
        return { driverId, position, status: position ? statuses(eventIndex) : "DNS", awardedPoints: points(event.session, position) };
      });
      return { sessionId: event.sessionId, session: event.session, results };
    }) };
}

function makeConstructorPath(relation: FrozenConstructorSymbolicRelation, winning: boolean): ConstructorRawPath & { readonly sessions: readonly SampleSession[] } {
  const selectedDrivers = relation.roster.filter((x) => x.constructorId === relation.selectedConstructorId).map((x) => x.driverId).sort();
  const strongestRival = relation.initialStandings.filter((x) => x.competitorId !== relation.selectedConstructorId).sort((a,b) => b.points-a.points || a.competitorId.localeCompare(b.competitorId))[0].competitorId;
  const rivalDrivers = relation.roster.filter((x) => x.constructorId === strongestRival).map((x) => x.driverId).sort();
  return { dataVersion: relation.dataVersion, ruleVersion: relation.ruleVersion, snapshotFingerprint: relation.snapshotFingerprint,
    sessions: relation.eventConstraints.map((event, eventIndex) => ({ sessionId: event.sessionId, session: event.session,
      results: [...relation.roster].sort((a,b) => a.driverId.localeCompare(b.driverId)).map(({ driverId }) => {
        const selectedIndex = selectedDrivers.indexOf(driverId);
        const rivalIndex = rivalDrivers.indexOf(driverId);
        const position = winning && selectedIndex >= 0 ? selectedIndex + 1 : (!winning && rivalIndex >= 0 ? rivalIndex + 1 : null);
        const status: ResultStatus = position !== null ? (selectedIndex === 1 && eventIndex % 2 ? "DNF" : "FINISHED") : (eventIndex % 2 ? "DNF" : "DNS");
        return { driverId, position, status, awardedPoints: points(event.session, position) };
      }) })) };
}

function verifyAwarded(relation: FrozenDriverSymbolicRelation | FrozenConstructorSymbolicRelation, sessions: readonly SampleSession[]): boolean {
  if (sessions.length > MAX_SESSIONS || relation.roster.length > MAX_ENTRANTS) return false;
  return sessions.every((session) => {
    try {
      const scored = scoreAndValidateEvent(session.session, relation.roster, session.results);
      return scored.every((row, index) => row.awardedPoints === session.results[index].awardedPoints);
    } catch { return false; }
  });
}

function pathSample(kind: "DRIVER" | "CONSTRUCTOR", m9: LayeredWinningResult, relation: FrozenDriverSymbolicRelation | FrozenConstructorSymbolicRelation, winning: boolean): PathSample | null {
  const path = kind === "DRIVER" ? makeDriverPath(relation as FrozenDriverSymbolicRelation, winning) : makeConstructorPath(relation as FrozenConstructorSymbolicRelation, winning);
  if (!verifyAwarded(relation, path.sessions)) return null;
  const exact = kind === "DRIVER" ? evaluateFrozenDriverRelation(relation as FrozenDriverSymbolicRelation, path as FrozenRawPath) : evaluateFrozenConstructorRelation(relation as FrozenConstructorSymbolicRelation, path as ConstructorRawPath);
  const equivalent = kind === "DRIVER" ? evaluateFrozenDriverLayerEquivalence(m9, path as FrozenRawPath) : evaluateFrozenConstructorLayerEquivalence(m9, path as ConstructorRawPath);
  if (exact.status !== "VALID" || equivalent.status !== "EQUIVALENT" || exact.accepted !== winning || equivalent.accepted !== winning || !exact.finalStandings) return null;
  const selectedId = kind === "DRIVER" ? (relation as FrozenDriverSymbolicRelation).selectedDriverId : (relation as FrozenConstructorSymbolicRelation).selectedConstructorId;
  const member = classifyExactFinalStandings(exact.finalStandings, selectedId);
  if (winning && member.status !== "MEMBER") return null;
  if (!winning && member.status === "MEMBER") return null;
  const selected = exact.finalStandings.find((x) => x.competitorId === selectedId)!;
  return deepFreeze({ label: "SAMPLE", disclaimer: SAMPLE_DISCLAIMER, id: winning ? "deterministic-points-ahead-win" : "deterministic-losing-contrast", kind, selectedContenderId:selectedId,
    purpose: winning ? "WINNING_WITNESS" : "LOSING_CONTRAST", expectedWin: winning, expectedGroup: member.status === "MEMBER" ? member.groupId : null,
    sessions: path.sessions, evidence: { selected, rivals: exact.finalStandings.filter((x) => x.competitorId !== selectedId), finalStandings:exact.finalStandings, exactRelationAccepted: exact.accepted, compactRuleAccepted: equivalent.compactPredicate } });
}

function standing(pointsValue: number, race: Record<number,number>, qualifying: Record<number,number>, id: string): ChampionshipStanding { return { competitorId: id, points: pointsValue, racePositions: race, qualifyingPositions: qualifying }; }
function boundaries(): readonly BoundarySample[] {
  const result: BoundarySample[] = [];
  const add = (kind:BoundarySample["kind"],thresholdId: BoundarySample["thresholdId"], side: BoundarySample["side"], difference: -1|0|1) => {
    const driver=kind==="DRIVER", selectedId=driver?"SELECTED":"X", rivalId=driver?"RIVAL":"Y";
    const entrants=driver?[{driverId:"SELECTED",constructorId:"X"},{driverId:"RIVAL",constructorId:"Y"}]:[{driverId:"X1",constructorId:"X"},{driverId:"X2",constructorId:"X"},{driverId:"Y1",constructorId:"Y"},{driverId:"Y2",constructorId:"Y"}];
    const selected=thresholdId==="POINTS_COMPARISON"?standing(100+difference,difference===0?{1:1}:{},{},selectedId):thresholdId==="RACE_COUNTBACK"?standing(100,{1:2,2:2+difference},{},selectedId):standing(100,{1:2,2:2},{1:3,2:3+difference},selectedId);
    const rival=thresholdId==="QUALIFYING_FALLBACK"?standing(100,{1:2,2:2},{1:3,2:3},rivalId):thresholdId==="RACE_COUNTBACK"?standing(100,{1:2,2:2},{},rivalId):standing(100,{}, {},rivalId);
    const session:SessionType=thresholdId==="RACE_COUNTBACK"?"race":"sprint";
    const question:TinyChampionshipQuestion={kind:driver?"driver":"constructor",contenderId:selectedId,initialStandings:[selected,rival],futureEvents:[{id:`${kind}-${thresholdId}-${side}`,session,entrants,allowedResults:Object.fromEntries(entrants.map(x=>[x.driverId,[{position:null,status:"DNS" as const}]]))}]};
    const artifact=createAuthenticatedBoundedGroupingFixture(question), events=enumerateEventOutcomes(question.futureEvents[0]);
    if(events.length!==1) throw new Error("Boundary fixture did not produce exactly one legal raw path.");
    const finalStandings=accumulateTinyPathStandings(question,events), finalSelected=finalStandings.find(x=>x.competitorId===selectedId)!, finalRival=finalStandings.find(x=>x.competitorId===rivalId)!;
    const comparison=compareStandings(finalSelected,finalRival), membership=classifyExactFinalStandings(finalStandings,selectedId), wins=enumerateWinningRawOutcomes(question);
    result.push({ label:"BOUNDARY_SAMPLE",disclaimer:SAMPLE_DISCLAIMER,kind,selectedContenderId:selectedId,thresholdId,side,difference,expectedGroup:membership.status==="MEMBER"?membership.groupId:null,expectedWin:membership.status==="MEMBER",basis:"AUTHENTICATED_M4_RAW_PATH",fixtureFingerprint:artifact.fingerprint,question,rawId:events[0].id,events,evidence:{selected:finalSelected,rival:finalRival,finalStandings,comparison,independentlyEnumeratedAsWinning:wins.some(x=>x.id===events[0].id)} });
  };
  for(const kind of ["DRIVER","CONSTRUCTOR"] as const) for(const threshold of ["POINTS_COMPARISON","RACE_COUNTBACK","QUALIFYING_FALLBACK"] as const) for(const difference of [-1,0,1] as const) add(kind,threshold,difference<0?"BELOW":difference?"ABOVE":"AT",difference);
  return deepFreeze(result);
}

function complete(m9: Extract<LayeredWinningResult,{status:"COMPLETE"}>, kind: "DRIVER"|"CONSTRUCTOR", relation: FrozenDriverSymbolicRelation|FrozenConstructorSymbolicRelation): SampledWinningResult {
  if (relation.dataVersion !== m9.certificate.dataVersion || relation.ruleVersion !== m9.certificate.ruleVersion || relation.snapshotFingerprint !== m9.certificate.snapshotFingerprint) return fail("SOURCE_MISMATCH", "The exact relation does not bind the authentic M9 result.");
  const selectedId = kind === "DRIVER" ? (relation as FrozenDriverSymbolicRelation).selectedDriverId : (relation as FrozenConstructorSymbolicRelation).selectedConstructorId;
  if (m9.certificate.sourceKind !== kind || m9.certificate.selectedContenderId !== selectedId) return fail("SOURCE_MISMATCH", "The selected contender does not bind the authentic M9 result.");
  if (relation.eventConstraints.length > MAX_SESSIONS || relation.roster.length > MAX_ENTRANTS) return fail("RESOURCE_LIMIT", "Sample generation stopped during resource preflight.");
  const win = pathSample(kind, m9, relation, true), loss = pathSample(kind, m9, relation, false);
  if (!win || !loss) return fail("SAMPLE_VERIFICATION_FAILED", "An independently re-scored full path disagreed with M6–M9; no sample layer was returned.");
  const availability: SampleAvailability[] = win.expectedGroup === "COUNTBACK_WIN" ? [] : [{ label:"SAMPLE", disclaimer:SAMPLE_DISCLAIMER, groupId:"COUNTBACK_WIN", status:"UNAVAILABLE", reason:"NO_SAFE_BOUNDED_WITNESS" }];
  const result=own({ status:"COMPLETE" as const, layers:[m9.layers[0],m9.layers[1],{ layer:"LABELED_SAMPLES" as const, samples:[win,loss], boundaries:boundaries(), availability }] as const, certificate:m9.certificate, sampleRuleVersion:SAMPLE_RULE_VERSION });
  verificationContexts.set(result,{kind,m9,relation});
  return result;
}

export type SampleVerificationResult = { readonly status:"VERIFIED"; readonly sampleCount:number; readonly boundaryCount:number } | { readonly status:"CALCULATION_FAILURE"; readonly reason:string };
/** A second pass driven only by emitted data; it does not reuse the generator's choices. */
export function verifySampledWinningResult(result: SampledWinningResult): SampleVerificationResult {
  if (!isGenuineSampledWinningResult(result) || result.status!=="COMPLETE") return {status:"CALCULATION_FAILURE",reason:"An authentic complete M10 artifact is required."};
  const context=verificationContexts.get(result); if(!context) return {status:"CALCULATION_FAILURE",reason:"Private sample provenance is missing."};
  if(result.layers.map(x=>x.layer).join(",")!=="COMPACT_RULE,DETAILED_GROUPS,LABELED_SAMPLES" || result.certificate!==(context.m9 as Extract<LayeredWinningResult,{status:"COMPLETE"}>).certificate) return {status:"CALCULATION_FAILURE",reason:"Ordered layers or the independent M9 certificate changed."};
  if(result.layers[2].samples.length!==2) return {status:"CALCULATION_FAILURE",reason:"The exact required sample set is missing or has extras."};
  for(let index=0;index<result.layers[2].samples.length;index+=1){ const sample=result.layers[2].samples[index], expectedWin=index===0;
    if(sample.label!=="SAMPLE"||sample.disclaimer!==SAMPLE_DISCLAIMER||!verifyAwarded(context.relation,sample.sessions)) return {status:"CALCULATION_FAILURE",reason:"A sample label, disclaimer, event, or awarded-points value is invalid."};
    const selectedId=context.kind==="DRIVER"?(context.relation as FrozenDriverSymbolicRelation).selectedDriverId:(context.relation as FrozenConstructorSymbolicRelation).selectedConstructorId;
    if(sample.id!==(expectedWin?"deterministic-points-ahead-win":"deterministic-losing-contrast")||sample.kind!==context.kind||sample.selectedContenderId!==selectedId||sample.purpose!==(expectedWin?"WINNING_WITNESS":"LOSING_CONTRAST")||sample.expectedWin!==expectedWin) return {status:"CALCULATION_FAILURE",reason:"A sample identity, kind, contender, purpose, or win claim changed."};
    const path={dataVersion:context.relation.dataVersion,ruleVersion:context.relation.ruleVersion,snapshotFingerprint:context.relation.snapshotFingerprint,sessions:sample.sessions};
    const exact=context.kind==="DRIVER"?evaluateFrozenDriverRelation(context.relation as FrozenDriverSymbolicRelation,path as FrozenRawPath):evaluateFrozenConstructorRelation(context.relation as FrozenConstructorSymbolicRelation,path as ConstructorRawPath);
    const check=context.kind==="DRIVER"?evaluateFrozenDriverLayerEquivalence(context.m9,path as FrozenRawPath):evaluateFrozenConstructorLayerEquivalence(context.m9,path as ConstructorRawPath);
    if(check.status!=="EQUIVALENT"||check.accepted!==sample.expectedWin) return {status:"CALCULATION_FAILURE",reason:"M6–M9 membership disagrees with a sample claim."};
    if(exact.status!=="VALID"||!exact.finalStandings) return {status:"CALCULATION_FAILURE",reason:"The exact relation rejected a sample path."};
    const selected=exact.finalStandings.find(x=>x.competitorId===selectedId)!,rivals=exact.finalStandings.filter(x=>x.competitorId!==selectedId),member=classifyExactFinalStandings(exact.finalStandings,selectedId),group=member.status==="MEMBER"?member.groupId:null;
    if(sample.expectedGroup!==group||sample.evidence.exactRelationAccepted!==exact.accepted||sample.evidence.compactRuleAccepted!==check.compactPredicate||JSON.stringify(sample.evidence.selected)!==JSON.stringify(selected)||JSON.stringify(sample.evidence.rivals)!==JSON.stringify(rivals)||JSON.stringify(sample.evidence.finalStandings)!==JSON.stringify(exact.finalStandings)) return {status:"CALCULATION_FAILURE",reason:"Recomputed final standings, group, or rule evidence disagrees with the sample."};
  }
  const expectedKeys=new Set<string>(); for(const kind of ["DRIVER","CONSTRUCTOR"]) for(const threshold of ["POINTS_COMPARISON","RACE_COUNTBACK","QUALIFYING_FALLBACK"]) for(const side of ["BELOW","AT","ABOVE"]) expectedKeys.add(`${kind}:${threshold}:${side}`);
  if(result.layers[2].boundaries.length!==expectedKeys.size) return {status:"CALCULATION_FAILURE",reason:"The exact required boundary matrix is missing or has extras."};
  for(const boundary of result.layers[2].boundaries){
    const key=`${boundary.kind}:${boundary.thresholdId}:${boundary.side}`; if(!expectedKeys.delete(key)||boundary.difference!==(boundary.side==="BELOW"?-1:boundary.side==="AT"?0:1)||boundary.basis!=="AUTHENTICATED_M4_RAW_PATH") return {status:"CALCULATION_FAILURE",reason:"A boundary is duplicated or its matrix metadata is inconsistent."};
    if(createAuthenticatedBoundedGroupingFixture(boundary.question).fingerprint!==boundary.fixtureFingerprint) return {status:"CALCULATION_FAILURE",reason:"The boundary fixture fingerprint is stale or forged."};
    const domains=boundary.question.futureEvents.map(enumerateEventOutcomes); if(domains.length!==1||domains[0].length!==1||domains[0][0].id!==boundary.rawId||JSON.stringify(domains[0])!==JSON.stringify(boundary.events)) return {status:"CALCULATION_FAILURE",reason:"A boundary path is not the exact independently enumerated legal M4 raw path."};
    if(!boundary.events.every(event=>{try{const scored=scoreAndValidateEvent(event.session,boundary.question.futureEvents[0].entrants,event.results);return JSON.stringify(scored)===JSON.stringify(event.results);}catch{return false;}})) return {status:"CALCULATION_FAILURE",reason:"M2 rejected a boundary event or its awarded points."};
    const finalStandings=accumulateTinyPathStandings(boundary.question,boundary.events),selected=finalStandings.find(x=>x.competitorId===boundary.selectedContenderId),rival=finalStandings.find(x=>x.competitorId!==boundary.selectedContenderId); if(!selected||!rival)return {status:"CALCULATION_FAILURE",reason:"M3 did not produce both boundary standings."};
    const comparison=compareStandings(selected,rival),member=classifyExactFinalStandings(finalStandings,boundary.selectedContenderId),group=member.status==="MEMBER"?member.groupId:null,wins=enumerateWinningRawOutcomes(boundary.question),m4win=wins.some(x=>x.id===boundary.rawId),compact=evaluateCompactRuleStandings(finalStandings,boundary.selectedContenderId);
    if(boundary.expectedWin!==m4win||m4win!==compact||boundary.expectedGroup!==group||boundary.evidence.independentlyEnumeratedAsWinning!==m4win||JSON.stringify(boundary.evidence.finalStandings)!==JSON.stringify(finalStandings)||JSON.stringify(boundary.evidence.selected)!==JSON.stringify(selected)||JSON.stringify(boundary.evidence.rival)!==JSON.stringify(rival)||JSON.stringify(boundary.evidence.comparison)!==JSON.stringify(comparison)) return {status:"CALCULATION_FAILURE",reason:"A threshold boundary failed independent M2/M3/M4/M8/M9 verification."};
  }
  return deepFreeze({status:"VERIFIED",sampleCount:result.layers[2].samples.length,boundaryCount:result.layers[2].boundaries.length});
}

export function deriveFrozenDriverSampledResult(m9: LayeredWinningResult, source: FrozenSymbolicResult): SampledWinningResult {
  if (!isGenuineLayeredWinningResult(m9)) return fail("INVALID_M9_RESULT", "An authentic M9 result is required; no samples were returned.");
  if (!isGenuineFrozenDriverResult(source)) return fail("SOURCE_MISMATCH", "A matching authentic M6 result is required.");
  if (m9.status === "ELIMINATED") { if(source.status!=="ELIMINATED"||source.reason!==m9.reason||source.proof!==m9.proof)return fail("SOURCE_MISMATCH","The authentic eliminated M6 result does not bind M9."); return own({ status:"ELIMINATED", layers:[], reason:m9.reason, proof:m9.proof }); }
  if (m9.status !== "COMPLETE" || source.status !== "COMPLETE") return fail("SOURCE_MISMATCH", "A matching authentic complete M6 relation is required.");
  return complete(m9,"DRIVER",source.relation);
}
export function deriveFrozenConstructorSampledResult(m9: LayeredWinningResult, source: ConstructorRelationResult): SampledWinningResult {
  if (!isGenuineLayeredWinningResult(m9)) return fail("INVALID_M9_RESULT", "An authentic M9 result is required; no samples were returned.");
  if (!isGenuineFrozenConstructorResult(source)) return fail("SOURCE_MISMATCH", "A matching authentic M7 result is required.");
  if (m9.status === "ELIMINATED") { if(source.status!=="ELIMINATED"||source.reason!==m9.reason||source.proof!==m9.proof)return fail("SOURCE_MISMATCH","The authentic eliminated M7 result does not bind M9."); return own({ status:"ELIMINATED", layers:[], reason:m9.reason, proof:m9.proof }); }
  if (m9.status !== "COMPLETE" || source.status !== "COMPLETE") return fail("SOURCE_MISMATCH", "A matching authentic complete M7 relation is required.");
  return complete(m9,"CONSTRUCTOR",source.relation);
}

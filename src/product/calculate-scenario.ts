import "server-only";
import type { ChampionshipKind } from "./frozen-product-data";
import { buildApprovedFrozenDriverRelation } from "../engine/relations/frozen-driver-symbolic-relation";
import { buildApprovedFrozenConstructorRelation } from "../engine/relations/frozen-constructor-symbolic-relation";
import { groupFrozenDriverRelation, groupFrozenConstructorRelation } from "../engine/groups/winning-groups";
import { deriveFrozenDriverLayeredResult, deriveFrozenConstructorLayeredResult } from "../engine/rules/compact-winning-rule";
import { deriveFrozenDriverSampledResult, deriveFrozenConstructorSampledResult, verifySampledWinningResult, SAMPLE_DISCLAIMER } from "../engine/samples/labeled-samples";
import type {ResultView} from "./result-view";
import type { VerifiedFrozenDriverSnapshot } from "../engine/relations/verified-frozen-driver-snapshot";
import { productDataFromSnapshot } from "./convex-dataset-runtime";
export type {ResultView} from "./result-view";

export interface CalculateRequest {kind:ChampionshipKind;contenderId:string;dataVersion:string;ruleVersion:string}
const descriptions={POINTS_AHEAD:"Finish with more points than every rival.",COUNTBACK_WIN:"Tie for the most points, then lead on race finishes; use qualifying only if every race count is tied."};

export function calculateScenarioFromSnapshot(snapshot:VerifiedFrozenDriverSnapshot,input:CalculateRequest):ResultView {
  const productData=productDataFromSnapshot(snapshot);
  if(input.dataVersion!==productData.dataVersion||input.ruleVersion!==productData.ruleVersion)return {status:"ERROR",kind:input.kind,contenderId:input.contenderId,dataVersion:productData.dataVersion,ruleVersion:productData.ruleVersion,reason:"The requested data or rules are stale. Review the current setup and calculate again."};
  const allowed=productData.standings[input.kind].some(x=>x.id===input.contenderId);
  if(!allowed)return {status:"ERROR",kind:input.kind,contenderId:input.contenderId,dataVersion:productData.dataVersion,ruleVersion:productData.ruleVersion,reason:"That contender is not in the approved frozen lineup."};
  const request={dataVersion:input.dataVersion,ruleVersion:input.ruleVersion,snapshotFingerprint:snapshot.fingerprint};
  const source=input.kind==="driver"?buildApprovedFrozenDriverRelation({...request,selectedDriverId:input.contenderId},snapshot):buildApprovedFrozenConstructorRelation({...request,selectedConstructorId:input.contenderId},snapshot);
  const groups=input.kind==="driver"?groupFrozenDriverRelation(source as ReturnType<typeof buildApprovedFrozenDriverRelation>):groupFrozenConstructorRelation(source as ReturnType<typeof buildApprovedFrozenConstructorRelation>);
  const m9=input.kind==="driver"?deriveFrozenDriverLayeredResult(source as ReturnType<typeof buildApprovedFrozenDriverRelation>,groups):deriveFrozenConstructorLayeredResult(source as ReturnType<typeof buildApprovedFrozenConstructorRelation>,groups);
  const m10=input.kind==="driver"?deriveFrozenDriverSampledResult(m9,source as ReturnType<typeof buildApprovedFrozenDriverRelation>):deriveFrozenConstructorSampledResult(m9,source as ReturnType<typeof buildApprovedFrozenConstructorRelation>);
  if(m10.status==="ELIMINATED")return {status:"ELIMINATED",kind:input.kind,contenderId:input.contenderId,dataVersion:input.dataVersion,ruleVersion:input.ruleVersion,reason:"Mathematically eliminated: even the maximum remaining points cannot produce a championship win."};
  if(m10.status!=="COMPLETE")return {status:"ERROR",kind:input.kind,contenderId:input.contenderId,dataVersion:input.dataVersion,ruleVersion:input.ruleVersion,reason:m10.reason};
  const verified=verifySampledWinningResult(m10); if(verified.status!=="VERIFIED")return {status:"ERROR",kind:input.kind,contenderId:input.contenderId,dataVersion:input.dataVersion,ruleVersion:input.ruleVersion,reason:verified.reason};
  const [ruleLayer,groupLayer,sampleLayer]=m10.layers;
  if(groups.status!=="COMPLETE")return {status:"ERROR",kind:input.kind,contenderId:input.contenderId,dataVersion:input.dataVersion,ruleVersion:input.ruleVersion,reason:"The authenticated group relationship is unavailable."};
  const selectedDriverIds=input.kind==="driver"?[input.contenderId]:(source.status==="COMPLETE"?source.relation.roster.filter(x=>x.constructorId===input.contenderId).map(x=>x.driverId):[]);
  const pathSamples=sampleLayer.samples.map(s=>({title:s.purpose==="WINNING_WITNESS"?"Winning replay":"Losing contrast",summary:`Across all ${s.sessions.length} remaining sessions, this exact replay is ${s.expectedWin?"a championship-winning path":"not a championship-winning path"}.`,label:SAMPLE_DISCLAIMER as typeof SAMPLE_DISCLAIMER,events:s.sessions.map(session=>{const outcomes=session.results.filter(row=>selectedDriverIds.includes(row.driverId)).map(row=>`${row.driverId}: ${row.status}${row.position?` P${row.position}`:""}, ${row.awardedPoints} pts`).join(" · ");return `${session.sessionId} — ${outcomes}`})}));
  const boundarySamples=sampleLayer.boundaries.filter(b=>b.kind===(input.kind==="driver"?"DRIVER":"CONSTRUCTOR")).map(b=>({title:`${b.thresholdId.replaceAll("_"," ")} · ${b.side.toLowerCase()}`,summary:`The exact ${b.side.toLowerCase()} threshold fixture ${b.expectedWin?"wins":"does not win"}${b.expectedGroup?` through ${b.expectedGroup}`:""}.`,label:SAMPLE_DISCLAIMER as typeof SAMPLE_DISCLAIMER}));
  return {status:"COMPLETE",kind:input.kind,contenderId:input.contenderId,dataVersion:input.dataVersion,ruleVersion:input.ruleVersion,rule:ruleLayer.rule.text,
    groups:groupLayer.groups.map(g=>({id:g.id,description:descriptions[g.id]})),
    groupRelationship:{behavior:groups.certificate.behavior,uniqueUnion:true,statement:"These groups are disjoint; no winning path is counted twice."},
    samples:[...pathSamples,...boundarySamples]};
}

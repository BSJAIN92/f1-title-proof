import { describe, expect, it } from "vitest";
import manifest from "../../../data/frozen/2026-09-01/manifest.json";
import { analyzeBoundedGroupCoverage, createAuthenticatedBoundedGroupingFixture, groupFrozenConstructorRelation, groupFrozenDriverRelation } from "../groups/winning-groups";
import { APPROVED_FROZEN_SNAPSHOT_FINGERPRINT, buildApprovedFrozenDriverRelation } from "../relations/frozen-driver-symbolic-relation";
import { buildApprovedFrozenConstructorRelation } from "../relations/frozen-constructor-symbolic-relation";
import { approvedSnapshotFixture } from "../../test/approved-frozen-fixture";
import { deriveBoundedEliminatedLayeredResult, deriveFrozenConstructorLayeredResult, deriveFrozenDriverLayeredResult } from "../rules/compact-winning-rule";
import { compareStandings } from "../standings/championship-standings";
import { deriveFrozenConstructorSampledResult, deriveFrozenDriverSampledResult, isGenuineSampledWinningResult, SAMPLE_DISCLAIMER, verifySampledWinningResult } from "./labeled-samples";

const snapshot = approvedSnapshotFixture();
const driverSource = (id: string) => buildApprovedFrozenDriverRelation({ selectedDriverId:id, dataVersion:manifest.dataVersion, ruleVersion:manifest.ruleVersion, snapshotFingerprint:APPROVED_FROZEN_SNAPSHOT_FINGERPRINT }, snapshot);
const constructorSource = (id: string) => buildApprovedFrozenConstructorRelation({ selectedConstructorId:id, dataVersion:manifest.dataVersion, ruleVersion:manifest.ruleVersion, snapshotFingerprint:APPROVED_FROZEN_SNAPSHOT_FINGERPRINT }, snapshot);

describe("M10 labeled samples", () => {
  it("adds the exact third layer without changing the M8/M9 certificate", () => {
    const source=driverSource("Lando Norris"), m9=deriveFrozenDriverLayeredResult(source,groupFrozenDriverRelation(source));
    const certificate=m9.status === "COMPLETE" ? m9.certificate : null;
    const result=deriveFrozenDriverSampledResult(m9,source);
    expect(result.status).toBe("COMPLETE"); if(result.status!=="COMPLETE") throw new Error(result.reason);
    expect(result.layers.map(x=>x.layer)).toEqual(["COMPACT_RULE","DETAILED_GROUPS","LABELED_SAMPLES"]);
    expect(result.certificate).toBe(certificate);
    expect(result.layers[2].samples.length).toBe(2);
    for(const item of [...result.layers[2].samples,...result.layers[2].boundaries,...result.layers[2].availability]) expect(item).toMatchObject({disclaimer:SAMPLE_DISCLAIMER});
    expect(result.layers[2].samples.map(x=>x.label)).toEqual(["SAMPLE","SAMPLE"]);
    expect(result.layers[2].boundaries.every(x=>x.label==="BOUNDARY_SAMPLE")).toBe(true);
    expect(Object.isFrozen(result) && Object.isFrozen(result.layers[2].samples[0].sessions[0].results)).toBe(true);
    expect(verifySampledWinningResult(result)).toEqual({status:"VERIFIED",sampleCount:2,boundaryCount:18});
  });

  it("independently verifies every exact boundary and its expected decision",()=>{
    const source=driverSource("Kimi Antonelli"), m9=deriveFrozenDriverLayeredResult(source,groupFrozenDriverRelation(source));
    const result=deriveFrozenDriverSampledResult(m9,source); if(result.status!=="COMPLETE") throw new Error(result.reason);
    expect(result.layers[2].boundaries).toHaveLength(18);
    for(const boundary of result.layers[2].boundaries){
      expect(boundary.difference).toBe(boundary.side==="BELOW"?-1:boundary.side==="AT"?0:1);
      expect(compareStandings(boundary.evidence.selected,boundary.evidence.rival)).toEqual(boundary.evidence.comparison);
    }
    expect(result.layers[2].boundaries.filter(x=>x.kind==="DRIVER"&&x.thresholdId==="POINTS_COMPARISON").map(x=>[x.side,x.expectedGroup,x.evidence.comparison.decidedBy])).toEqual([
      ["BELOW",null,"points"],["AT","COUNTBACK_WIN","race"],["ABOVE","POINTS_AHEAD","points"]]);
    expect(result.layers[2].boundaries.filter(x=>x.kind==="DRIVER"&&x.thresholdId==="RACE_COUNTBACK").map(x=>[x.side,x.expectedGroup])).toEqual([["BELOW",null],["AT",null],["ABOVE","COUNTBACK_WIN"]]);
    expect(result.layers[2].boundaries.filter(x=>x.kind==="DRIVER"&&x.thresholdId==="QUALIFYING_FALLBACK").map(x=>[x.side,x.expectedGroup])).toEqual([["BELOW",null],["AT",null],["ABOVE","COUNTBACK_WIN"]]);
  });

  it("derives legal verified win/loss paths for all frozen drivers and constructors",()=>{
    for(const id of manifest.futureLineup.flatMap(x=>x.drivers)){
      const source=driverSource(id), m9=deriveFrozenDriverLayeredResult(source,groupFrozenDriverRelation(source)), result=deriveFrozenDriverSampledResult(m9,source);
      expect(result.status,id).toBe("COMPLETE"); if(result.status!=="COMPLETE") continue;
      expect(result.layers[2].samples.map(x=>[x.expectedWin,x.evidence.exactRelationAccepted])).toEqual([[true,true],[false,false]]);
      const statuses=result.layers[2].samples.flatMap(x=>x.sessions.flatMap(s=>s.results.map(r=>`${r.status}:${r.position===null?"NULL":"CLASSIFIED"}`)));
      expect(statuses).toEqual(expect.arrayContaining(["FINISHED:CLASSIFIED","DNF:CLASSIFIED","DNF:NULL","DNS:NULL"]));
    }
    for(const id of manifest.futureLineup.map(x=>x.constructor)){
      const source=constructorSource(id), m9=deriveFrozenConstructorLayeredResult(source,groupFrozenConstructorRelation(source)), result=deriveFrozenConstructorSampledResult(m9,source);
      expect(result.status,id).toBe("COMPLETE"); if(result.status!=="COMPLETE") continue;
      expect(result.layers[2].samples.map(x=>x.expectedWin)).toEqual([true,false]);
    }
  });

  it("rejects forged, stale, mismatched, and mutated provenance without partial samples",()=>{
    const source=driverSource("Lando Norris"), m9=deriveFrozenDriverLayeredResult(source,groupFrozenDriverRelation(source));
    expect(deriveFrozenDriverSampledResult({...m9} as typeof m9,source)).toMatchObject({status:"CALCULATION_FAILURE",code:"INVALID_M9_RESULT"});
    const other=driverSource("Oscar Piastri");
    expect(deriveFrozenDriverSampledResult(m9,other)).toMatchObject({status:"CALCULATION_FAILURE",code:"SOURCE_MISMATCH"});
    const result=deriveFrozenDriverSampledResult(m9,source); expect(isGenuineSampledWinningResult(result)).toBe(true);
    expect(isGenuineSampledWinningResult({...result})).toBe(false);
    expect(verifySampledWinningResult({...result} as typeof result)).toMatchObject({status:"CALCULATION_FAILURE"});
    expect(()=>{(result as unknown as {status:string}).status="bad";}).toThrow();
  });

  it("rejects every formerly trusted sample field and boundary matrix mutation",()=>{
    const source=driverSource("Lando Norris"),m9=deriveFrozenDriverLayeredResult(source,groupFrozenDriverRelation(source)),result=deriveFrozenDriverSampledResult(m9,source); if(result.status!=="COMPLETE")throw new Error(result.reason);
    const sample=result.layers[2].samples[0],boundary=result.layers[2].boundaries[0];
    const badSamples=[{...sample,id:"bad"},{...sample,kind:"CONSTRUCTOR"},{...sample,selectedContenderId:"bad"},{...sample,purpose:"LOSING_CONTRAST"},{...sample,expectedWin:false},{...sample,expectedGroup:null},{...sample,evidence:{...sample.evidence,compactRuleAccepted:false}},{...sample,evidence:{...sample.evidence,finalStandings:[]}},{...sample,sessions:sample.sessions.slice(1)}];
    for(const bad of badSamples){const clone={...result,layers:[result.layers[0],result.layers[1],{...result.layers[2],samples:[bad,result.layers[2].samples[1]]}]} as unknown as typeof result;expect(verifySampledWinningResult(clone)).toMatchObject({status:"CALCULATION_FAILURE"});}
    const badBoundaries=[{...boundary,label:"SAMPLE"},{...boundary,disclaimer:"bad"},{...boundary,side:"AT"},{...boundary,difference:0},{...boundary,basis:"AUTHENTICATED_BOUNDED_FIXTURE"},{...boundary,rawId:"bad"},{...boundary,expectedWin:!boundary.expectedWin},{...boundary,expectedGroup:"POINTS_AHEAD"}];
    for(const bad of badBoundaries){const clone={...result,layers:[result.layers[0],result.layers[1],{...result.layers[2],boundaries:[bad,...result.layers[2].boundaries.slice(1)]}]} as unknown as typeof result;expect(verifySampledWinningResult(clone)).toMatchObject({status:"CALCULATION_FAILURE"});}
    for(const changed of [result.layers[2].boundaries.slice(1),[boundary,...result.layers[2].boundaries]]){const clone={...result,layers:[result.layers[0],result.layers[1],{...result.layers[2],boundaries:changed}]} as unknown as typeof result;expect(verifySampledWinningResult(clone)).toMatchObject({status:"CALCULATION_FAILURE"});}
  });

  it("checks source authenticity before preserving an eliminated M9 result",()=>{
    const fixture=createAuthenticatedBoundedGroupingFixture({kind:"driver",contenderId:"A",initialStandings:[{competitorId:"A",points:0,racePositions:{},qualifyingPositions:{}},{competitorId:"B",points:1,racePositions:{},qualifyingPositions:{}}],futureEvents:[]});
    const coverage=analyzeBoundedGroupCoverage(fixture,10),eliminated=deriveBoundedEliminatedLayeredResult(fixture,coverage),source=driverSource("Lando Norris");
    expect(eliminated.status).toBe("ELIMINATED");
    expect(deriveFrozenDriverSampledResult(eliminated,source)).toMatchObject({status:"CALCULATION_FAILURE",code:"SOURCE_MISMATCH"});
    expect(deriveFrozenDriverSampledResult(eliminated,{...source} as typeof source)).toMatchObject({status:"CALCULATION_FAILURE",code:"SOURCE_MISMATCH"});
  });
});

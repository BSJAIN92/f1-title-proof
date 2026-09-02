/* eslint-disable @typescript-eslint/no-explicit-any -- one worker handles the parallel driver/constructor authenticated APIs */
import manifest from "../data/frozen/2026-09-01/manifest.json";
import {performance} from "node:perf_hooks";
import {calculateTimingStats,countRelationSize} from "../src/benchmarks/milestone-11";
import {approvedSnapshotFixture} from "../src/test/approved-frozen-fixture";
import {buildApprovedFrozenDriverRelation} from "../src/engine/relations/frozen-driver-symbolic-relation";
import {buildApprovedFrozenConstructorRelation} from "../src/engine/relations/frozen-constructor-symbolic-relation";
import {groupFrozenConstructorRelation,groupFrozenDriverRelation} from "../src/engine/groups/winning-groups";
import {deriveFrozenConstructorLayeredResult,deriveFrozenDriverLayeredResult} from "../src/engine/rules/compact-winning-rule";
import {deriveFrozenConstructorSampledResult,deriveFrozenDriverSampledResult,verifySampledWinningResult} from "../src/engine/samples/labeled-samples";

const kind=process.argv[2] as "DRIVER"|"CONSTRUCTOR"|"STALE_FAILURE";
const iterations=Number(process.env.M11_ITERATIONS??20),warmups=3;
const snapshot=approvedSnapshotFixture();
const requestBase={dataVersion:manifest.dataVersion,ruleVersion:manifest.ruleVersion,snapshotFingerprint:snapshot.fingerprint};

function execute(id:string){
  const started=performance.now();
  if(kind==="STALE_FAILURE"){
    const result=buildApprovedFrozenDriverRelation({...requestBase,selectedDriverId:id,dataVersion:"stale-data-version"},snapshot);
    if(result.status!=="CALCULATION_FAILURE"||result.code!=="STALE_SNAPSHOT")throw new Error("Stale safety path did not reject the request.");
    return {total:performance.now()-started,relation:performance.now()-started,result,outcome:"STALE_SNAPSHOT"};
  }
  const relationStarted=performance.now();
  const source=kind==="DRIVER"?buildApprovedFrozenDriverRelation({...requestBase,selectedDriverId:id},snapshot):buildApprovedFrozenConstructorRelation({...requestBase,selectedConstructorId:id},snapshot);
  const relationMs=performance.now()-relationStarted;
  if(source.status!=="COMPLETE")throw new Error(`${kind} ${id} was not a complete authentic relation: ${source.status}`);
  const groups=kind==="DRIVER"?groupFrozenDriverRelation(source as any):groupFrozenConstructorRelation(source as any);
  const layered=kind==="DRIVER"?deriveFrozenDriverLayeredResult(source as any,groups):deriveFrozenConstructorLayeredResult(source as any,groups);
  const sampled=kind==="DRIVER"?deriveFrozenDriverSampledResult(layered,source as any):deriveFrozenConstructorSampledResult(layered,source as any);
  const checked=verifySampledWinningResult(sampled);
  if(groups.status!=="COMPLETE"||layered.status!=="COMPLETE"||sampled.status!=="COMPLETE"||checked.status!=="VERIFIED")throw new Error(`${kind} ${id} failed the M8-M10 authenticity gate.`);
  return {total:performance.now()-started,relation:relationMs,result:sampled,source,correctness:"VERIFIED"};
}

const ids=kind==="DRIVER"?snapshot.standings.map(x=>x.driverId):kind==="CONSTRUCTOR"?snapshot.constructorStandings.map(x=>x.constructorId):[snapshot.standings[0].driverId];
for(let i=0;i<warmups;i++)execute(ids[i%ids.length]);
const heapBefore=process.memoryUsage().heapUsed;
const cases=[];
for(const id of ids){
  const rawTimingsMs:number[]=[],relationTimingsMs:number[]=[];let last:any;
  for(let i=0;i<iterations;i++){last=execute(id);rawTimingsMs.push(last.total);relationTimingsMs.push(last.relation)}
  const standing=kind==="DRIVER"?snapshot.standings.find(x=>x.driverId===id):kind==="CONSTRUCTOR"?snapshot.constructorStandings.find(x=>x.constructorId===id):undefined;
  cases.push({id,standingPoints:standing?.points??null,rawTimingsMs,relationTimingsMs,stats:calculateTimingStats(rawTimingsMs),relationConstructionStats:calculateTimingStats(relationTimingsMs),
    correctness:last.correctness,outcome:last.outcome,size:last.source?.status==="COMPLETE"?countRelationSize(last.source.relation,last.result):undefined});
}
const memory=process.memoryUsage(),peak=process.resourceUsage().maxRSS;
process.stdout.write(JSON.stringify({kind,warmupIterations:warmups,iterationsPerCase:iterations,cases,memory:{heapUsedBeforeBytes:heapBefore,heapUsedAfterBytes:memory.heapUsed,processPeakRssBytes:peak*1024,semantics:"Process-wide peak RSS since isolated worker start; heap values bracket measured work. These are not precise per-request allocations."}}));

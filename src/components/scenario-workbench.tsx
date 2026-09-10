"use client";
import {useEffect,useRef,useState} from "react";
import type {ProductData,ChampionshipKind} from "../product/frozen-product-data";
import type {HeadToHeadResult} from "../product/head-to-head";
import {parseHeadToHeadResult} from "../product/head-to-head-result";
import {StandingsPanel} from "./standings-panel";
import {ScenarioDossier} from "./scenario-dossier";

async function reason(response:Response){try{const value:unknown=await response.json();if(value&&typeof value==="object"&&"reason" in value&&typeof value.reason==="string")return value.reason}catch{}return "The comparison could not be completed."}

export function ScenarioWorkbench({data}:{data:ProductData}){
 const[kind,setKind]=useState<ChampionshipKind>("driver"),[targetId,setTargetId]=useState(""),[rivalId,setRivalId]=useState(""),[result,setResult]=useState<HeadToHeadResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),pending=useRef(false),season=new Date(data.cutoff).getFullYear();
 useEffect(()=>{void fetch("/api/visit",{method:"POST",keepalive:true}).catch(()=>undefined)},[]);
 async function compare(target=targetId,rival=rivalId,nextKind=kind,nextDataVersion=data.dataVersion,nextRuleVersion=data.ruleVersion){if(pending.current||!target||!rival)return;pending.current=true;setKind(nextKind);setTargetId(target);setRivalId(rival);setBusy(true);setResult(null);setError(null);try{const response=await fetch("/api/compare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:nextKind,targetId:target,rivalId:rival,dataVersion:nextDataVersion,ruleVersion:nextRuleVersion})});if(!response.ok)throw new Error(await reason(response));const value=parseHeadToHeadResult(await response.json());if(!value||value.targetId!==target||value.rivalId!==rival||value.dataVersion!==nextDataVersion)throw new Error("The server returned a stale or invalid comparison.");setResult(value)}catch(value){setError(value instanceof Error?value.message:"The comparison could not be completed.")}finally{pending.current=false;setBusy(false)}}
 function back(){setTargetId("");setRivalId("");setResult(null);setError(null)}
 return <div className={`workbench ${targetId?"show-detail":"show-master"}`}><StandingsPanel season={season} kind={kind} remaining={data.remaining} rows={data.standings[kind]} busy={busy} onKind={next=>{setKind(next);back()}} onCompare={(target,rival)=>void compare(target,rival)}/>{targetId?<ScenarioDossier kind={kind} targetId={targetId} rivalId={rivalId} result={result} busy={busy} error={error} onBack={back} onRetry={()=>void compare()}/>:null}</div>
}

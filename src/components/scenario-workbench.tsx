"use client";
import {useEffect,useRef,useState} from "react";
import type {ProductData,ChampionshipKind} from "../product/frozen-product-data";
import type {HeadToHeadResult} from "../product/head-to-head";
import {parseHeadToHeadResult} from "../product/head-to-head-result";
import {StandingsPanel} from "./standings-panel";
import {ComparisonWorkspace} from "./comparison-workspace";

async function reason(response:Response){try{const value:unknown=await response.json();if(value&&typeof value==="object"&&"reason" in value&&typeof value.reason==="string")return value.reason}catch{}return "The comparison could not be completed."}

export function ScenarioWorkbench({data}:{data:ProductData}){
 const[kind,setKind]=useState<ChampionshipKind>("driver"),[targetId,setTargetId]=useState(""),[rivalId,setRivalId]=useState(""),[result,setResult]=useState<HeadToHeadResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),pending=useRef(false),season=new Date(data.cutoff).getFullYear(),rows=data.standings[kind];
 useEffect(()=>{void fetch("/api/visit",{method:"POST",keepalive:true}).catch(()=>undefined)},[]);
 function resetResult(){setResult(null);setError(null)}
 function chooseTarget(id:string){setTargetId(id);if(id===rivalId)setRivalId("");resetResult()}
 function chooseRival(id:string){setRivalId(id);resetResult()}
 function changeKind(next:ChampionshipKind){setKind(next);setTargetId("");setRivalId("");resetResult()}
 async function compare(){if(pending.current||!targetId||!rivalId)return;pending.current=true;setBusy(true);setResult(null);setError(null);try{const response=await fetch("/api/compare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,targetId,rivalId,dataVersion:data.dataVersion,ruleVersion:data.ruleVersion})});if(!response.ok)throw new Error(await reason(response));const value=parseHeadToHeadResult(await response.json());if(!value||value.targetId!==targetId||value.rivalId!==rivalId||value.dataVersion!==data.dataVersion)throw new Error("The server returned a stale or invalid comparison.");setResult(value)}catch(value){setError(value instanceof Error?value.message:"The comparison could not be completed.")}finally{pending.current=false;setBusy(false)}}
 function clearComparison(){if(targetId&&rivalId)void fetch("/api/comparison-return",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,targetId,rivalId,dataVersion:data.dataVersion,ruleVersion:data.ruleVersion}),keepalive:true}).catch(()=>undefined);setTargetId("");setRivalId("");resetResult()}
 return <div className="title-proof-app"><header className="product-bar"><div className="product-mark"><strong>Formula 1 Championship</strong><i>{season} Season</i></div><div className="season-summary"><span>Races remaining <b>{data.remaining.races}</b></span><span>Sprints remaining <b>{data.remaining.sprints}</b></span><span>Maximum points <b>{data.remaining.maximumPoints[kind].total}</b></span></div></header><div className="championship-workbench"><StandingsPanel season={season} kind={kind} remaining={data.remaining} rows={rows} selectedId={targetId} rivalId={rivalId} onKind={changeKind} onSelect={chooseTarget}/><ComparisonWorkspace kind={kind} rows={rows} remaining={data.remaining} targetId={targetId} rivalId={rivalId} result={result} busy={busy} error={error} onTarget={chooseTarget} onRival={chooseRival} onCompare={()=>void compare()} onClear={clearComparison} onRetry={()=>void compare()}/></div></div>
}

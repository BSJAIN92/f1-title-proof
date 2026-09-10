"use client";
import {useRef,useState,type KeyboardEvent} from "react";
import type {HeadToHeadResult} from "../product/head-to-head";

interface PositionRow { raw:string; date:string; venue:string; session:string; target:string; rival:string }
interface SummaryRow { session:string; finish:string; count:number }
function positionRow(raw:string,targetId:string,rivalId:string):PositionRow{
 const [eventPart="",outcomePart=""]=raw.split(" — "),eventParts=eventPart.split(":"),date=eventParts.shift()??"",session=eventParts.pop()??"",venue=eventParts.join(":"),outcomes=outcomePart.split(" · ");
 const value=(text:string|undefined,name:string)=>text?.startsWith(`${name}: `)?text.slice(name.length+2):(text??"—");
 return{raw,date,venue,session:session?session[0].toUpperCase()+session.slice(1):"—",target:value(outcomes[0],targetId),rival:value(outcomes[1],rivalId)}
}
function summaryRows(rows:readonly PositionRow[],competitor:"target"|"rival"):SummaryRow[]{
 const grouped=new Map<string,SummaryRow>();
 for(const row of rows){const finish=row[competitor].replace(/ \(\d+\)$/,""),key=`${row.session}:${finish}`,current=grouped.get(key);if(current)current.count+=1;else grouped.set(key,{session:row.session,finish,count:1})}
 const position=(finish:string)=>Number(finish.match(/^P(\d+)/)?.[1]??999);
 return[...grouped.values()].sort((a,b)=>(a.session==="Race"?0:1)-(b.session==="Race"?0:1)||position(a.finish)-position(b.finish))
}
function FinishSummary({name,rows,rival=false}:{name:string;rows:readonly SummaryRow[];rival?:boolean}){return <table className={`scenario-summary${rival?" scenario-summary--rival":""}`}><caption>Finish summary for {name}</caption><thead><tr><th scope="col">Session</th><th scope="col">Finish in this example</th><th scope="col">Times</th></tr></thead><tbody>{rows.map(row=><tr key={`${row.session}:${row.finish}`}><th scope="row">{row.session}</th><td>{row.finish}</td><td>{row.count}</td></tr>)}</tbody></table>}

export function ResultProof({result}:{result:HeadToHeadResult}){
 const[selected,setSelected]=useState(0),tabs=useRef<Array<HTMLButtonElement|null>>([]),example=result.examples[selected]??result.examples[0];
 function selectFromKeyboard(event:KeyboardEvent<HTMLButtonElement>,index:number){if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"&&event.key!=="Home"&&event.key!=="End")return;event.preventDefault();const last=result.examples.length-1,next=event.key==="Home"?0:event.key==="End"?last:event.key==="ArrowRight"?(index+1)%result.examples.length:(index-1+result.examples.length)%result.examples.length;setSelected(next);tabs.current[next]?.focus()}
 if(!example)return null;
 const rows=example.events.map(event=>positionRow(event,result.targetId,result.rivalId)),targetSummary=summaryRows(rows,"target"),rivalSummary=summaryRows(rows,"rival");
 return <section className="result-block" aria-label="Position examples"><div className="scenario-tabs" role="tablist" aria-label="Winning scenarios">{result.examples.map((item,index)=><button key={item.title} ref={element=>{tabs.current[index]=element}} type="button" role="tab" id={`scenario-tab-${index}`} aria-selected={selected===index} aria-controls={`scenario-panel-${index}`} tabIndex={selected===index?0:-1} onClick={()=>setSelected(index)} onKeyDown={event=>selectFromKeyboard(event,index)}>{item.title}</button>)}</div><div className="sample-rail" role="tabpanel" id={`scenario-panel-${selected}`} aria-labelledby={`scenario-tab-${selected}`}><article><strong>Example path</strong><p>{result.targetId} finishes {example.finalMargin} point{example.finalMargin===1?"":"s"} ahead.</p><div className="scenario-summary-wrap"><FinishSummary name={result.targetId} rows={targetSummary}/><FinishSummary name={result.rivalId} rows={rivalSummary} rival/></div><div className="scenario-table-wrap"><table className="scenario-table"><caption className="sr-only">Upcoming race positions for {result.targetId} and {result.rivalId}</caption><thead><tr><th scope="col">Date</th><th scope="col">Grand Prix</th><th scope="col">Session</th><th scope="col">{result.targetId}</th><th scope="col">{result.rivalId}</th></tr></thead><tbody>{rows.map(row=><tr key={row.raw}><td>{row.date}</td><th scope="row">{row.venue}</th><td>{row.session}</td><td>{row.target}</td><td>{row.rival}</td></tr>)}</tbody></table></div></article></div></section>
}

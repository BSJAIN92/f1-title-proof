"use client";
import {useRef,useState,type KeyboardEvent} from "react";
import type {HeadToHeadResult} from "../product/head-to-head";

export function ResultProof({result}:{result:HeadToHeadResult}){
 const[selected,setSelected]=useState(0),tabs=useRef<Array<HTMLButtonElement|null>>([]),example=result.examples[selected]??result.examples[0];
 function selectFromKeyboard(event:KeyboardEvent<HTMLButtonElement>,index:number){if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"&&event.key!=="Home"&&event.key!=="End")return;event.preventDefault();const last=result.examples.length-1,next=event.key==="Home"?0:event.key==="End"?last:event.key==="ArrowRight"?(index+1)%result.examples.length:(index-1+result.examples.length)%result.examples.length;setSelected(next);tabs.current[next]?.focus()}
 if(!example)return null;
 return <section className="result-block" aria-label="Position examples"><div className="scenario-tabs" role="tablist" aria-label="Winning scenarios">{result.examples.map((item,index)=><button key={item.title} ref={element=>{tabs.current[index]=element}} type="button" role="tab" id={`scenario-tab-${index}`} aria-selected={selected===index} aria-controls={`scenario-panel-${index}`} tabIndex={selected===index?0:-1} onClick={()=>setSelected(index)} onKeyDown={event=>selectFromKeyboard(event,index)}>{item.title}</button>)}</div><div className="sample-rail" role="tabpanel" id={`scenario-panel-${selected}`} aria-labelledby={`scenario-tab-${selected}`}><article><strong>{example.title}</strong><p>{result.targetId} finishes {example.finalMargin} point{example.finalMargin===1?"":"s"} ahead.</p><details><summary>Show upcoming race positions</summary><ol>{example.events.map(event=><li key={event}>{event}</li>)}</ol></details></article></div></section>
}

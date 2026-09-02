export const SAMPLE_LABEL="Sample only — not complete coverage." as const;
export type ChampionshipKind="driver"|"constructor";
export type GroupView={id:"POINTS_AHEAD"|"COUNTBACK_WIN";description:string};
export type SampleView={title:string;summary:string;label:typeof SAMPLE_LABEL;events?:readonly string[]};
export interface ResultView {status:"COMPLETE"|"ELIMINATED"|"ERROR";kind:ChampionshipKind;contenderId:string;dataVersion:string;ruleVersion:string;reason?:string;rule?:string;groups?:readonly GroupView[];groupRelationship?:{behavior:"DISJOINT"|"OVERLAPPING";uniqueUnion:true;statement:string};samples?:readonly SampleView[]}
const record=(x:unknown):x is Record<string,unknown>=>typeof x==="object"&&x!==null&&!Array.isArray(x);
const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(y=>typeof y==="string");
export function parseResultView(x:unknown):ResultView|null{
 if(!record(x)||(x.status!=="COMPLETE"&&x.status!=="ELIMINATED"&&x.status!=="ERROR")||(x.kind!=="driver"&&x.kind!=="constructor")||typeof x.contenderId!=="string"||typeof x.dataVersion!=="string"||typeof x.ruleVersion!=="string")return null;
 const kind:ChampionshipKind=x.kind;const base={kind,contenderId:x.contenderId,dataVersion:x.dataVersion,ruleVersion:x.ruleVersion};
 if(x.status==="ERROR"||x.status==="ELIMINATED")return typeof x.reason==="string"?{status:x.status,...base,reason:x.reason}:null;
 if(typeof x.rule!=="string"||!Array.isArray(x.groups)||x.groups.length!==2||!record(x.groupRelationship)||(x.groupRelationship.behavior!=="DISJOINT"&&x.groupRelationship.behavior!=="OVERLAPPING")||x.groupRelationship.uniqueUnion!==true||typeof x.groupRelationship.statement!=="string"||!Array.isArray(x.samples))return null;
 const groups:GroupView[]=[];for(const group of x.groups){if(!record(group)||(group.id!=="POINTS_AHEAD"&&group.id!=="COUNTBACK_WIN")||typeof group.description!=="string")return null;groups.push({id:group.id,description:group.description})}
 const samples:SampleView[]=[];for(const sample of x.samples){if(!record(sample)||typeof sample.title!=="string"||typeof sample.summary!=="string"||sample.label!==SAMPLE_LABEL||(sample.events!==undefined&&!strings(sample.events)))return null;samples.push({title:sample.title,summary:sample.summary,label:SAMPLE_LABEL,...(sample.events?{events:sample.events}:{})})}
 return {status:"COMPLETE",...base,rule:x.rule,groups,groupRelationship:{behavior:x.groupRelationship.behavior,uniqueUnion:true,statement:x.groupRelationship.statement},samples};
}

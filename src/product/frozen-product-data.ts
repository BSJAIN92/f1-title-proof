export type ChampionshipKind = "driver" | "constructor";
export interface StandingView { id:string; position:number; points:number; gap:number; eligible:boolean }
export interface ProductData {
  dataVersion:string; ruleVersion:string; cutoff:string; remainingSessions:number;
  remaining:{races:number;sprints:number;maximumPoints:{driver:{races:number;sprints:number;total:number};constructor:{races:number;sprints:number;total:number}}};
  assumptions:readonly string[]; unsupported:readonly string[];
  standings:{driver:readonly StandingView[];constructor:readonly StandingView[]};
}

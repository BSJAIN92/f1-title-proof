export type ChampionshipKind = "driver" | "constructor";
export interface StandingView { id:string; position:number; points:number; gap:number; eligible:boolean }
export interface ProductData {
  dataVersion:string; ruleVersion:string; cutoff:string; remainingSessions:number;
  assumptions:readonly string[]; unsupported:readonly string[];
  standings:{driver:readonly StandingView[];constructor:readonly StandingView[]};
}

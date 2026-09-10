"use client";
import type {ChampionshipKind} from "../product/frozen-product-data";
import type {HeadToHeadResult} from "../product/head-to-head";
import {ResultProof} from "./result-proof";

export function ScenarioDossier({kind,targetId,rivalId,result,busy,error,onBack,onRetry}:{kind:ChampionshipKind;targetId:string;rivalId:string;result:HeadToHeadResult|null;busy:boolean;error:string|null;onBack:()=>void;onRetry:()=>void}){return <main className="dossier dossier--result" id="dossier"><button className="back" onClick={onBack}>← Back to standings</button><header className="dossier__intro"><p className="eyebrow">Head-to-head · {kind}</p><h2>{targetId} vs {rivalId}</h2><p>Winning paths for {targetId} to win championship ahead of {rivalId}.</p></header>{busy?<div className="live" role="status" aria-live="polite">Calculating every winning points difference.</div>:null}{error?<section className="error" role="alert"><h3>Comparison stopped</h3><p>{error}</p><button onClick={onRetry}>Retry comparison</button></section>:null}{result?<ResultProof result={result}/>:null}</main>}

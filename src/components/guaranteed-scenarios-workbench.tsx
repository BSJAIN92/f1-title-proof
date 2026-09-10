"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { ChampionshipKind, ProductData } from "../product/frozen-product-data";
import type { GuaranteedScenarioPage } from "../product/guaranteed-scenarios";
import { parseGuaranteedScenarioPage } from "../product/guaranteed-scenario-result";
import { StandingsPanel } from "./standings-panel";
import { GuaranteedScenarioList } from "./guaranteed-scenario-list";

async function responseReason(response:Response) { try { const value:unknown = await response.json(); if (value && typeof value === "object" && "reason" in value && typeof value.reason === "string") return value.reason; } catch {} return "The scenarios could not be loaded."; }

export function GuaranteedScenariosWorkbench({ data }:{ data:ProductData }) {
  const [kind,setKind] = useState<ChampionshipKind>("driver");
  const [contenderId,setContenderId] = useState("");
  const [page,setPage] = useState<GuaranteedScenarioPage|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const requestId = useRef(0);
  const season = new Date(data.cutoff).getFullYear();
  const rows = data.standings[kind].slice(0, kind === "driver" ? 6 : 3);

  async function load(nextKind:ChampionshipKind, nextId:string, cursor?:string) {
    const id = ++requestId.current;
    setBusy(true); setError(null);
    if (!cursor) setPage(null);
    try {
      const response = await fetch("/api/scenarios", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ kind:nextKind, contenderId:nextId, dataVersion:data.dataVersion, ruleVersion:data.ruleVersion, ...(cursor ? { cursor } : {}) }) });
      if (!response.ok) throw new Error(await responseReason(response));
      const parsed = parseGuaranteedScenarioPage(await response.json());
      if (!parsed || parsed.kind !== nextKind || parsed.contenderId !== nextId || parsed.dataVersion !== data.dataVersion) throw new Error("The server returned stale or invalid scenarios.");
      if (id !== requestId.current) return;
      setPage(previous => cursor && previous ? { ...parsed, items:[...previous.items,...parsed.items] } : parsed);
      if (!cursor && window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => document.getElementById("scenario-results")?.scrollIntoView({ block:"start", inline:"start" }));
    } catch (value) { if (id === requestId.current) setError(value instanceof Error ? value.message : "The scenarios could not be loaded."); }
    finally { if (id === requestId.current) setBusy(false); }
  }

  function chooseContender(id:string) { setContenderId(id); void load(kind,id); if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => document.getElementById("scenario-workspace")?.scrollIntoView()); }
  function changeKind(next:ChampionshipKind) { requestId.current += 1; setKind(next); setContenderId(""); setPage(null); setError(null); setBusy(false); }

  return <div className="title-proof-app scenarios-app">
    <header className="product-bar"><div className="product-mark"><strong>Formula 1 Championship</strong><i>{season} Season</i></div><div className="season-summary"><span>Races remaining <b>{data.remaining.races}</b></span><span>Sprint remaining <b>{data.remaining.sprints}</b></span></div><Link href="/">Head-to-head</Link></header>
    <div className="championship-workbench">
      <StandingsPanel season={season} kind={kind} remaining={data.remaining} rows={rows} selectedId={contenderId} rivalId="" onKind={changeKind} onSelect={chooseContender}/>
      <main className="scenario-workspace" id="scenario-workspace">
        <header className="scenario-intro"><p className="eyebrow">Strict points guarantee</p><h2>Possible championship scenarios</h2><p>Choose a top {kind === "driver" ? "six driver" : "three team"} to see every grouped finish summary that guarantees the championship on points.</p></header>
        <section className="scenario-method"><div><span>Included</span><strong>Every matching finish-count summary</strong><p>All standings rivals are checked, including contenders outside this selector.</p></div><div><span>Ordering</span><strong>Fewest points first</strong><p>The Sprint is separate and every zero-point finish shares one bucket.</p></div><div><span>Not included</span><strong>Countback ties</strong><p>A scenario appears only when the contender must finish strictly ahead on points.</p></div></section>
        {!contenderId ? <section className="scenario-empty"><span aria-hidden="true">01 — 06</span><h3>Choose a contender</h3><p>Select a driver or constructor from the standings to load guaranteed scenarios.</p></section> : null}
        {busy && !page ? <section className="scenario-empty" role="status"><span aria-hidden="true">CALC</span><h3>Counting scenarios</h3><p>The first page may take a moment, especially for constructors.</p></section> : null}
        {error ? <section className="battle-error" role="alert"><div><p className="eyebrow">Scenarios unavailable</p><strong>{error}</strong></div><button onClick={() => void load(kind,contenderId,page?.nextCursor ?? undefined)}>Try again</button></section> : null}
        {page ? <section className="scenario-results" id="scenario-results" aria-live="polite"><header><div><p className="eyebrow">Guaranteed on points</p><h3>{page.contenderId}</h3></div><p>Current points <b>{page.currentPoints}</b><span>Strongest current rival: {page.strongestRivalId}, {page.strongestRivalPoints} pts</span></p></header><GuaranteedScenarioList items={page.items}/>{page.nextCursor ? <button className="scenario-more" disabled={busy} onClick={() => void load(kind,contenderId,page.nextCursor!)}>{busy ? "Loading more…" : "Load 25 more scenarios"}</button> : <p className="scenario-end">Every matching scenario has been shown.</p>}</section> : null}
      </main>
    </div>
  </div>;
}

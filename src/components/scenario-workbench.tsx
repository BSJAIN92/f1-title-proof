"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnonymousState, HistorySummary } from "../convex/contracts";
import { parseAnonymousState } from "../convex/contracts";
import type { ProductData, ChampionshipKind } from "../product/frozen-product-data";
import type { ResultView } from "../product/result-view";
import { parseResultView } from "../product/result-view";
import { CalculationHistory, type HistoryLoadState } from "./calculation-history";
import { StandingsPanel } from "./standings-panel";
import { ScenarioDossier } from "./scenario-dossier";

async function responseReason(response: Response, fallback: string) {
  try {
    const value: unknown = await response.json();
    if (value && typeof value === "object" && "reason" in value && typeof value.reason === "string") return value.reason;
  } catch { /* The status code is still useful when the body is not JSON. */ }
  return fallback;
}

async function fetchAnonymousState(): Promise<AnonymousState> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(await responseReason(response, "Calculation history is unavailable."));
  return parseAnonymousState(await response.json());
}

export function ScenarioWorkbench({ data }: { data: ProductData }) {
  const [kind, setKind] = useState<ChampionshipKind>("driver");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<"error" | "stale">("error");
  const [detail, setDetail] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryLoadState>("loading");
  const [history, setHistory] = useState<readonly HistorySummary[]>([]);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const pending = useRef(false);

  const reopen = useCallback(async (entry: HistorySummary, restoring = false) => {
    if (pending.current) return;
    if (!data.standings[entry.kind].some((row) => row.id === entry.contenderId)) {
      setErrorTone("stale");
      setError("That saved contender is not in the current approved standings.");
      return;
    }
    pending.current = true;
    setReopeningId(entry.id);
    setBusy(true);
    setError(null);
    if (!restoring) {
      setKind(entry.kind);
      setSelectedId(entry.contenderId);
      setDetail(true);
      setResult(null);
    }
    try {
      const response = await fetch("/api/reopen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ historyId: entry.id }) });
      if (!response.ok) throw new Error(await responseReason(response, "That calculation could not be reopened."));
      const value = parseResultView(await response.json());
      if (!value || value.status === "ERROR" || value.kind !== entry.kind || value.contenderId !== entry.contenderId
        || value.dataVersion !== entry.dataVersion || value.ruleVersion !== entry.ruleVersion) {
        throw new Error("The reopened calculation did not match its saved version binding.");
      }
      setResult(value);
      setErrorTone("error");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That calculation could not be reopened.");
    } finally {
      pending.current = false;
      setBusy(false);
      setReopeningId(null);
    }
  }, [data.standings]);

  // Restore only server-validated Convex state; no proof or selection comes from browser storage.
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const state = await fetchAnonymousState();
        if (!active) return;
        setHistory(state.history);
        setHistoryState("ready");
        const selection = state.latestSelection;
        if (!selection || selection.dataVersion !== data.dataVersion || selection.ruleVersion !== data.ruleVersion
          || !data.standings[selection.kind].some((row) => row.id === selection.contenderId)) return;
        setKind(selection.kind);
        setSelectedId(selection.contenderId);
        setDetail(true);
        const latest = state.history[0];
        if (latest && latest.kind === selection.kind && latest.contenderId === selection.contenderId
          && latest.dataVersion === selection.dataVersion && latest.ruleVersion === selection.ruleVersion) {
          await reopen(latest, true);
        }
      } catch {
        if (active) setHistoryState("unavailable");
      }
    }
    void restore();
    return () => { active = false; };
  }, [data.dataVersion, data.ruleVersion, data.standings, reopen]);

  async function refreshHistory() {
    setHistoryState("loading");
    try {
      const state = await fetchAnonymousState();
      setHistory(state.history);
      setHistoryState("ready");
    } catch { setHistoryState("unavailable"); }
  }

  async function persistSelection(nextKind: ChampionshipKind, contenderId: string) {
    try {
      const response = await fetch("/api/selection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        kind: nextKind, contenderId, dataVersion: data.dataVersion, ruleVersion: data.ruleVersion,
      }) });
      if (!response.ok) throw new Error(await responseReason(response, "The selection could not be saved."));
    } catch (reason) {
      setErrorTone("error");
      setError(reason instanceof Error ? reason.message : "The selection could not be saved.");
    }
  }

  function choose(id: string) {
    setSelectedId(id);
    setResult(null);
    setError(null);
    setDetail(true);
    void persistSelection(kind, id);
  }

  function switchKind(next: ChampionshipKind) {
    setKind(next);
    setSelectedId(null);
    setResult(null);
    setError(null);
    setDetail(false);
  }

  async function requestScenario(requestKind: ChampionshipKind, contenderId: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        kind: requestKind, contenderId, dataVersion: data.dataVersion, ruleVersion: data.ruleVersion,
      }) });
      if (!response.ok) throw new Error(await responseReason(response, "The server could not complete this calculation."));
      const value = parseResultView(await response.json());
      if (!value) throw new Error("The server returned an invalid result. Retry the calculation.");
      if (value.dataVersion !== data.dataVersion || value.ruleVersion !== data.ruleVersion || value.kind !== requestKind || value.contenderId !== contenderId) {
        setErrorTone("stale");
        throw new Error("The returned result is stale or belongs to another contender. Review the setup and retry.");
      }
      if (value.status === "ERROR") throw new Error(value.reason);
      setErrorTone("error");
      setResult(value);
      await refreshHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Calculation could not be completed.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const historyLog = <CalculationHistory state={historyState} entries={history} reopeningId={reopeningId} onReopen={(entry) => void reopen(entry)} onRetry={() => void refreshHistory()} />;
  return <div className={`workbench ${detail ? "show-detail" : "show-master"}`}>
    <StandingsPanel kind={kind} rows={data.standings[kind]} selectedId={selectedId} onKind={switchKind} onSelect={choose} />
    <ScenarioDossier data={data} kind={kind} selectedId={selectedId} result={result} busy={busy} error={error} errorTone={errorTone}
      onCalculate={() => selectedId ? void requestScenario(kind, selectedId) : undefined}
      onBack={() => { setDetail(false); requestAnimationFrame(() => document.querySelector<HTMLElement>(".standing-row[aria-current=true]")?.focus()); }}
      history={historyLog} />
  </div>;
}

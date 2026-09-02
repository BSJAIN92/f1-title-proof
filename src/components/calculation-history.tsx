"use client";
import type { HistorySummary } from "../convex/contracts";

export type HistoryLoadState = "loading" | "ready" | "unavailable";

function readableTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function CalculationHistory({ state, entries, reopeningId, onReopen, onRetry }: {
  state: HistoryLoadState;
  entries: readonly HistorySummary[];
  reopeningId: string | null;
  onReopen: (entry: HistorySummary) => void;
  onRetry: () => void;
}) {
  return <section className="history-log" aria-labelledby="history-title">
    <header><div><p className="eyebrow">Evidence log</p><h3 id="history-title">Recent calculations</h3></div><span>Newest 20</span></header>
    {state === "loading" ? <p className="history-state" role="status">Loading this browser&apos;s calculation log…</p> : null}
    {state === "unavailable" ? <div className="history-state" role="alert"><p>Calculation history is unavailable. Nothing has been restored from browser storage.</p><button type="button" onClick={onRetry}>Retry history</button></div> : null}
    {state === "ready" && entries.length === 0 ? <p className="history-state">No calculations recorded for this browser yet.</p> : null}
    {state === "ready" && entries.length > 0 ? <ol className="history-list">{entries.slice(0, 20).map((entry) => <li key={entry.id}>
      <button type="button" onClick={() => onReopen(entry)} disabled={reopeningId !== null} aria-label={`Reopen ${entry.contenderId} calculation`}>
        <span className="history-docket"><strong>{entry.contenderId}</strong><small>{entry.kind === "driver" ? "Drivers' championship" : "Constructors' championship"}</small></span>
        <span className={`history-status history-status--${entry.resultStatus.toLowerCase()}`}>{entry.resultStatus}</span>
        <span className="history-version">{entry.dataVersion}</span>
        <time dateTime={new Date(entry.requestedAt).toISOString()}>{readableTime(entry.requestedAt)}</time>
        <b>{reopeningId === entry.id ? "Recomputing…" : "Reopen →"}</b>
      </button>
    </li>)}</ol> : null}
  </section>;
}

"use client";
import type { ComparisonHistorySummary } from "../convex/contracts";

export type HistoryLoadState = "loading" | "ready" | "unavailable";
const readableTime = (timestamp: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));

export function CalculationHistory({ state, entries, onReopen, onRetry }: {
  state: HistoryLoadState;
  entries: readonly ComparisonHistorySummary[];
  onReopen: (entry: ComparisonHistorySummary) => void;
  onRetry: () => void;
}) {
  return <section className="history-log" aria-labelledby="history-title">
    <header><div><p className="eyebrow">Evidence log</p><h3 id="history-title">Recent comparisons</h3></div><span>This browser · newest 20</span></header>
    {state === "loading" ? <p className="history-state" role="status">Loading this browser&apos;s comparison log…</p> : null}
    {state === "unavailable" ? <div className="history-state" role="alert"><p>Comparison history is unavailable. Your comparison tool still works.</p><button type="button" onClick={onRetry}>Retry history</button></div> : null}
    {state === "ready" && entries.length === 0 ? <p className="history-state">No comparisons recorded for this browser yet.</p> : null}
    {state === "ready" && entries.length > 0 ? <ol className="history-list">{entries.map((entry) => <li key={entry.id}>
      <button type="button" onClick={() => onReopen(entry)} aria-label={`Compare ${entry.targetId} with ${entry.rivalId} again`}>
        <span className="history-docket"><strong>{entry.targetId} vs {entry.rivalId}</strong><small>{entry.kind === "driver" ? "Drivers' championship" : "Constructors' championship"}</small></span>
        <span className={`history-status history-status--${entry.resultStatus.toLowerCase()}`}>{entry.resultStatus}</span>
        <span className="history-version">{entry.dataVersion}</span>
        <time dateTime={new Date(entry.requestedAt).toISOString()}>{readableTime(entry.requestedAt)}</time>
        <b>Compare again →</b>
      </button>
    </li>)}</ol> : null}
  </section>;
}

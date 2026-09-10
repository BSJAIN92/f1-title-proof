import type { DashboardSnapshot, PopularComparison } from "../analytics/dashboard-contract";
import Link from "next/link";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const dateLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

function MatchupTable({ title, eyebrow, rows }: { title: string; eyebrow: string; rows: readonly PopularComparison[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <section className="dashboard-panel matchup-panel">
    <header><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span>Completed</span></header>
    {rows.length ? <ol>{rows.map((row, index) => <li key={`${row.first}-${row.second}`}>
      <span className="matchup-rank">{String(index + 1).padStart(2, "0")}</span>
      <div><strong>{row.first} <i>vs</i> {row.second}</strong><span className="matchup-meter"><b style={{ width: `${row.count / max * 100}%` }} /></span></div>
      <b>{number.format(row.count)}</b>
    </li>)}</ol> : <p className="dashboard-empty">No completed {eyebrow.toLowerCase()} comparisons in this period.</p>}
  </section>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="dashboard-metric"><p>{label}</p><strong>{value}</strong><small>{note}</small></article>;
}

export function ActivityDashboard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const maxDaily = Math.max(1, ...snapshot.daily.map((day) => Math.max(day.visitors, day.comparisons)));
  const countryTrackingPartial = snapshot.range.start < snapshot.countryTrackingStartedAt;
  return <main className="activity-dashboard">
    <header className="dashboard-header">
      <div><p className="eyebrow">Title Proof · pit wall telemetry</p><h1>Activity dashboard</h1><p>Anonymous product usage. Times and day boundaries are shown in UTC.</p></div>
      <div className="dashboard-header__actions"><Link href="/">Open app ↗</Link><form action="/api/dashboard/logout" method="post"><button>Log out</button></form></div>
    </header>

    <nav className="period-filter" aria-label="Dashboard period">
      {[['day','Today'],['week','7 days'],['month','30 days']].map(([period, label]) => <a key={period} href={`/dashboard?period=${period}`} aria-current={snapshot.range.period === period ? "page" : undefined}>{label}</a>)}
      <form><input type="hidden" name="period" value="custom" /><label>From <input type="date" name="from" defaultValue={snapshot.range.from} required /></label><label>To <input type="date" name="to" defaultValue={snapshot.range.to} required /></label><button type="submit">Apply</button></form>
    </nav>

    <section className="dashboard-metrics" aria-label="Activity summary">
      <Metric label="Unique visitors" value={number.format(snapshot.uniqueVisitors)} note="Anonymous browsers active" />
      <Metric label="Unique countries" value={number.format(snapshot.uniqueCountries)} note={countryTrackingPartial ? "Partial: tracking began Sep 10" : "Based on privacy-safe country codes"} />
      <Metric label="Comparisons / user" value={number.format(snapshot.averageComparisonsPerUser)} note="Overall for this period" />
      <Metric label="Completed comparisons" value={number.format(snapshot.totalComparisons)} note={`${number.format(snapshot.comparingVisitors)} visitors compared`} />
      <Metric label="Completion rate" value={`${number.format(snapshot.comparisonCompletionRate)}%`} note="Completed out of all attempts" />
    </section>

    <section className="dashboard-panel telemetry-panel">
      <header><div><p className="eyebrow">Daily pace</p><h2>Visitors and comparison depth</h2></div><div className="telemetry-legend"><span>Visitors</span><span>Comparisons</span></div></header>
      <div className="telemetry-chart" style={{ gridTemplateColumns: `repeat(${snapshot.daily.length}, minmax(46px, 1fr))`, minWidth: `${snapshot.daily.length * 52}px` }}>{snapshot.daily.map((day) => <article key={day.date} title={`${day.date}: ${day.visitors} visitors, ${day.comparisons} comparisons`}>
        <div className="telemetry-bars"><i style={{ height: `${Math.max(day.visitors / maxDaily * 100, day.visitors ? 4 : 0)}%` }} /><b style={{ height: `${Math.max(day.comparisons / maxDaily * 100, day.comparisons ? 4 : 0)}%` }} /></div>
        <strong>{number.format(day.averageComparisonsPerUser)}</strong><small>{dateLabel.format(new Date(`${day.date}T00:00:00Z`))}</small>
      </article>)}</div>
      <footer>Number above each day = average comparisons per visitor</footer>
    </section>

    <div className="matchup-grid"><MatchupTable title="Driver battles" eyebrow="Driver" rows={snapshot.popularDriverComparisons} /><MatchupTable title="Constructor battles" eyebrow="Team" rows={snapshot.popularConstructorComparisons} /></div>

    <section className="dashboard-panel country-panel"><header><div><p className="eyebrow">Geography</p><h2>Visitor countries</h2></div><span>Unique visitors</span></header>
      {snapshot.countries.length ? <ol>{snapshot.countries.map((country, index) => <li key={country.code}><span>{String(index + 1).padStart(2, "0")}</span><strong>{countryNames.of(country.code) ?? country.code}</strong><small>{country.code}</small><b>{number.format(country.visitors)}</b></li>)}</ol> : <p className="dashboard-empty">No country data in this period. Country tracking began with this dashboard release.</p>}
    </section>
  </main>;
}

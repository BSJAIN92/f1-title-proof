export type DashboardPeriod = "day" | "week" | "month" | "custom";

export interface DashboardRange {
  readonly period: DashboardPeriod;
  readonly start: number;
  readonly end: number;
  readonly from?: string;
  readonly to?: string;
}

export interface DashboardEvent {
  readonly visitorHash: string;
  readonly eventType: "visit" | "comparison_completed" | "comparison_failed" | "comparison_returned";
  readonly kind?: "driver" | "constructor";
  readonly driverId?: string;
  readonly constructorId?: string;
  readonly rivalId?: string;
  readonly countryCode?: string;
  readonly occurredAt: number;
}

export interface PopularComparison { readonly first: string; readonly second: string; readonly count: number }
export interface CountryActivity { readonly code: string; readonly visitors: number }
export interface DailyActivity { readonly date: string; readonly visitors: number; readonly comparisons: number; readonly averageComparisonsPerUser: number }
export interface DashboardDailyVisitor { readonly date: string; readonly visitorHash: string; readonly visited: boolean; readonly countryCode?: string; readonly comparisons: number }
export interface DashboardDailyMatchup { readonly date: string; readonly kind: "driver" | "constructor"; readonly first: string; readonly second: string; readonly count: number }
export interface DashboardDailyTotal { readonly date: string; readonly completed: number; readonly failed: number; readonly returned: number }

export interface DashboardSnapshot {
  readonly range: DashboardRange;
  readonly uniqueVisitors: number;
  readonly uniqueCountries: number;
  readonly totalComparisons: number;
  readonly comparingVisitors: number;
  readonly averageComparisonsPerUser: number;
  readonly comparisonCompletionRate: number;
  readonly countries: readonly CountryActivity[];
  readonly popularDriverComparisons: readonly PopularComparison[];
  readonly popularConstructorComparisons: readonly PopularComparison[];
  readonly daily: readonly DailyActivity[];
  readonly countryTrackingStartedAt: number;
}

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const COUNTRY_TRACKING_STARTED_AT = Date.UTC(2026, 8, 10);

function validDate(value: string | undefined) {
  if (!value || !DATE.test(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : undefined;
}

export function parseDashboardRange(values: { period?: string; from?: string; to?: string }, now = Date.now()): DashboardRange {
  if (values.period === "custom") {
    const start = validDate(values.from);
    const inclusiveEnd = validDate(values.to);
    if (start !== undefined && inclusiveEnd !== undefined && start <= inclusiveEnd && inclusiveEnd - start <= 366 * DAY) {
      return { period: "custom", start, end: inclusiveEnd + DAY, from: values.from, to: values.to };
    }
  }
  const period = values.period === "day" || values.period === "month" ? values.period : "week";
  const days = period === "day" ? 1 : period === "month" ? 30 : 7;
  const today = Math.floor(now / DAY) * DAY;
  return { period, start: today - (days - 1) * DAY, end: now };
}

const rounded = (value: number) => Math.round(value * 100) / 100;
const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

function rankMatchups(events: readonly DashboardEvent[], kind: "driver" | "constructor") {
  const counts = new Map<string, PopularComparison>();
  for (const event of events) {
    if (event.eventType !== "comparison_completed" || event.kind !== kind || !event.rivalId) continue;
    const selected = kind === "driver" ? event.driverId : event.constructorId;
    if (!selected) continue;
    const [first, second] = [selected, event.rivalId].sort((a, b) => a.localeCompare(b));
    const key = `${first}\u0000${second}`;
    counts.set(key, { first, second, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first) || a.second.localeCompare(b.second)).slice(0, 10);
}

export function aggregateDashboardEvents(events: readonly DashboardEvent[], range: DashboardRange): DashboardSnapshot {
  const bounded = events.filter((event) => event.occurredAt >= range.start && event.occurredAt < range.end);
  const visits = bounded.filter((event) => event.eventType === "visit");
  const completed = bounded.filter((event) => event.eventType === "comparison_completed");
  const failed = bounded.filter((event) => event.eventType === "comparison_failed");
  const visitors = new Set(visits.map((event) => event.visitorHash));
  const comparingVisitors = new Set(completed.map((event) => event.visitorHash));
  const countryVisitors = new Map<string, Set<string>>();
  for (const visit of visits) if (visit.countryCode) {
    const set = countryVisitors.get(visit.countryCode) ?? new Set<string>();
    set.add(visit.visitorHash); countryVisitors.set(visit.countryCode, set);
  }
  const daily = new Map<string, { visitors: Set<string>; comparisons: number }>();
  const firstDay = Math.floor(range.start / DAY) * DAY;
  for (let cursor = firstDay; cursor < range.end; cursor += DAY) daily.set(dateKey(cursor), { visitors: new Set(), comparisons: 0 });
  for (const visit of visits) daily.get(dateKey(visit.occurredAt))?.visitors.add(visit.visitorHash);
  for (const comparison of completed) { const item = daily.get(dateKey(comparison.occurredAt)); if (item) item.comparisons += 1; }
  const attempts = completed.length + failed.length;
  return {
    range,
    uniqueVisitors: visitors.size,
    uniqueCountries: countryVisitors.size,
    totalComparisons: completed.length,
    comparingVisitors: comparingVisitors.size,
    averageComparisonsPerUser: visitors.size ? rounded(completed.length / visitors.size) : 0,
    comparisonCompletionRate: attempts ? rounded(completed.length / attempts * 100) : 0,
    countries: [...countryVisitors].map(([code, set]) => ({ code, visitors: set.size })).sort((a, b) => b.visitors - a.visitors || a.code.localeCompare(b.code)),
    popularDriverComparisons: rankMatchups(completed, "driver"),
    popularConstructorComparisons: rankMatchups(completed, "constructor"),
    daily: [...daily].map(([date, item]) => ({ date, visitors: item.visitors.size, comparisons: item.comparisons, averageComparisonsPerUser: item.visitors.size ? rounded(item.comparisons / item.visitors.size) : 0 })),
    countryTrackingStartedAt: COUNTRY_TRACKING_STARTED_AT,
  };
}

export function aggregateDashboardDailyRecords(records: { visitors: readonly DashboardDailyVisitor[]; matchups: readonly DashboardDailyMatchup[]; totals: readonly DashboardDailyTotal[] }, range: DashboardRange): DashboardSnapshot {
  const visitors = new Set(records.visitors.filter((row) => row.visited).map((row) => row.visitorHash));
  const comparingVisitors = new Set(records.visitors.filter((row) => row.comparisons > 0).map((row) => row.visitorHash));
  const countryVisitors = new Map<string, Set<string>>();
  for (const row of records.visitors) if (row.visited && row.countryCode) { const set = countryVisitors.get(row.countryCode) ?? new Set<string>(); set.add(row.visitorHash); countryVisitors.set(row.countryCode, set); }
  const matchupMaps = { driver: new Map<string, PopularComparison>(), constructor: new Map<string, PopularComparison>() };
  for (const row of records.matchups) { const map = matchupMaps[row.kind]; const key = `${row.first}\u0000${row.second}`; map.set(key, { first: row.first, second: row.second, count: (map.get(key)?.count ?? 0) + row.count }); }
  const ranked = (map: Map<string, PopularComparison>) => [...map.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first) || a.second.localeCompare(b.second)).slice(0, 10);
  const totalsByDate = new Map(records.totals.map((row) => [row.date, row]));
  const visitorsByDate = new Map<string, number>();
  for (const row of records.visitors) if (row.visited) visitorsByDate.set(row.date, (visitorsByDate.get(row.date) ?? 0) + 1);
  const totalComparisons = records.totals.reduce((sum, row) => sum + row.completed, 0);
  const failures = records.totals.reduce((sum, row) => sum + row.failed, 0);
  const daily: DailyActivity[] = [];
  const firstDay = Math.floor(range.start / DAY) * DAY;
  for (let cursor = firstDay; cursor < range.end; cursor += DAY) {
    const date = dateKey(cursor); const visitorCount = visitorsByDate.get(date) ?? 0; const comparisons = totalsByDate.get(date)?.completed ?? 0;
    daily.push({ date, visitors: visitorCount, comparisons, averageComparisonsPerUser: visitorCount ? rounded(comparisons / visitorCount) : 0 });
  }
  return {
    range, uniqueVisitors: visitors.size, uniqueCountries: countryVisitors.size, totalComparisons, comparingVisitors: comparingVisitors.size,
    averageComparisonsPerUser: visitors.size ? rounded(totalComparisons / visitors.size) : 0,
    comparisonCompletionRate: totalComparisons + failures ? rounded(totalComparisons / (totalComparisons + failures) * 100) : 0,
    countries: [...countryVisitors].map(([code, set]) => ({ code, visitors: set.size })).sort((a, b) => b.visitors - a.visitors || a.code.localeCompare(b.code)),
    popularDriverComparisons: ranked(matchupMaps.driver), popularConstructorComparisons: ranked(matchupMaps.constructor), daily, countryTrackingStartedAt: COUNTRY_TRACKING_STARTED_AT,
  };
}

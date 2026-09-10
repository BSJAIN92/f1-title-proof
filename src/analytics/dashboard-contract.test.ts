import { describe, expect, it } from "vitest";
import { aggregateDashboardDailyRecords, aggregateDashboardEvents, parseDashboardRange } from "./dashboard-contract";

const now = Date.UTC(2026, 8, 10, 12);

describe("parseDashboardRange", () => {
  it("uses rolling preset windows", () => {
    expect(parseDashboardRange({ period: "day" }, now)).toMatchObject({ start: Date.UTC(2026, 8, 10), end: now, period: "day" });
    expect(parseDashboardRange({ period: "week" }, now).start).toBe(Date.UTC(2026, 8, 4));
    expect(parseDashboardRange({ period: "month" }, now).start).toBe(Date.UTC(2026, 7, 12));
  });

  it("uses inclusive UTC calendar dates for custom ranges", () => {
    expect(parseDashboardRange({ period: "custom", from: "2026-09-01", to: "2026-09-03" }, now)).toEqual({
      period: "custom", start: Date.UTC(2026, 8, 1), end: Date.UTC(2026, 8, 4), from: "2026-09-01", to: "2026-09-03",
    });
  });

  it("falls back to week for malformed custom ranges", () => {
    expect(parseDashboardRange({ period: "custom", from: "bad", to: "2026-09-03" }, now).period).toBe("week");
  });
});

describe("aggregateDashboardEvents", () => {
  it("counts visitors, countries, canonical matchups, and daily averages", () => {
    const start = Date.UTC(2026, 8, 1);
    const result = aggregateDashboardEvents([
      { visitorHash: "a", eventType: "visit", countryCode: "IN", occurredAt: start + 100 },
      { visitorHash: "a", eventType: "visit", countryCode: "IN", occurredAt: start + 200 },
      { visitorHash: "b", eventType: "visit", countryCode: "GB", occurredAt: start + 300 },
      { visitorHash: "a", eventType: "comparison_completed", kind: "driver", driverId: "Norris", rivalId: "Piastri", occurredAt: start + 400 },
      { visitorHash: "b", eventType: "comparison_completed", kind: "driver", driverId: "Piastri", rivalId: "Norris", occurredAt: start + 500 },
      { visitorHash: "a", eventType: "comparison_completed", kind: "constructor", constructorId: "McLaren", rivalId: "Ferrari", occurredAt: start + 600 },
      { visitorHash: "b", eventType: "comparison_failed", kind: "driver", driverId: "Norris", rivalId: "Verstappen", occurredAt: start + 700 },
    ], { period: "custom", start, end: start + 86_400_000, from: "2026-09-01", to: "2026-09-01" });
    expect(result.uniqueVisitors).toBe(2);
    expect(result.uniqueCountries).toBe(2);
    expect(result.totalComparisons).toBe(3);
    expect(result.averageComparisonsPerUser).toBe(1.5);
    expect(result.comparisonCompletionRate).toBe(75);
    expect(result.popularDriverComparisons[0]).toMatchObject({ first: "Norris", second: "Piastri", count: 2 });
    expect(result.popularConstructorComparisons[0]).toMatchObject({ first: "Ferrari", second: "McLaren", count: 1 });
    expect(result.daily[0]).toMatchObject({ visitors: 2, comparisons: 3, averageComparisonsPerUser: 1.5 });
  });

  it("returns safe zeros for no activity", () => {
    const range = parseDashboardRange({ period: "day" }, now);
    expect(aggregateDashboardEvents([], range)).toMatchObject({ uniqueVisitors: 0, uniqueCountries: 0, totalComparisons: 0, averageComparisonsPerUser: 0, comparisonCompletionRate: 0 });
  });

  it("builds the same core metrics from compact daily records", () => {
    const start = Date.UTC(2026, 8, 1);
    const range = { period: "custom" as const, start, end: start + 86_400_000, from: "2026-09-01", to: "2026-09-01" };
    const result = aggregateDashboardDailyRecords({
      visitors: [
        { date: "2026-09-01", visitorHash: "a", visited: true, countryCode: "IN", comparisons: 2 },
        { date: "2026-09-01", visitorHash: "b", visited: true, countryCode: "GB", comparisons: 1 },
      ],
      matchups: [{ date: "2026-09-01", kind: "driver", first: "Norris", second: "Piastri", count: 3 }],
      totals: [{ date: "2026-09-01", completed: 3, failed: 1, returned: 0 }],
    }, range);
    expect(result).toMatchObject({ uniqueVisitors: 2, uniqueCountries: 2, totalComparisons: 3, comparingVisitors: 2, averageComparisonsPerUser: 1.5, comparisonCompletionRate: 75 });
    expect(result.daily[0]).toMatchObject({ visitors: 2, comparisons: 3, averageComparisonsPerUser: 1.5 });
  });
});

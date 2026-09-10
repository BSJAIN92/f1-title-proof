import type { MutationCtx } from "./_generated/server";

export type ActivityEvent = {
  visitorHash: string; eventType: "visit" | "comparison_completed" | "comparison_failed" | "comparison_returned";
  kind?: "driver" | "constructor"; driverId?: string; constructorId?: string; rivalId?: string; countryCode?: string; occurredAt: number;
};

const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export async function updateDailyActivity(ctx: MutationCtx, event: ActivityEvent) {
  const date = dateKey(event.occurredAt);
  const visitor = await ctx.db.query("dailyVisitorActivity").withIndex("by_date_visitor", (q) => q.eq("date", date).eq("visitorHash", event.visitorHash)).unique();
  const comparisonIncrement = event.eventType === "comparison_completed" ? 1 : 0;
  if (visitor) await ctx.db.patch(visitor._id, {
    visited: visitor.visited || event.eventType === "visit",
    comparisons: visitor.comparisons + comparisonIncrement,
    ...(event.countryCode ? { countryCode: event.countryCode } : {}),
  });
  else await ctx.db.insert("dailyVisitorActivity", { date, visitorHash: event.visitorHash, visited: event.eventType === "visit", comparisons: comparisonIncrement, ...(event.countryCode ? { countryCode: event.countryCode } : {}) });

  if (event.eventType === "comparison_completed" && event.kind && event.rivalId) {
    const selected = event.kind === "driver" ? event.driverId : event.constructorId;
    if (selected) {
      const [first, second] = [selected, event.rivalId].sort((a, b) => a.localeCompare(b));
      const matchup = await ctx.db.query("dailyMatchupActivity").withIndex("by_date_matchup", (q) => q.eq("date", date).eq("kind", event.kind!).eq("first", first).eq("second", second)).unique();
      if (matchup) await ctx.db.patch(matchup._id, { count: matchup.count + 1 });
      else await ctx.db.insert("dailyMatchupActivity", { date, kind: event.kind, first, second, count: 1 });
    }
  }

  const totals = await ctx.db.query("dailyActivityTotals").withIndex("by_date", (q) => q.eq("date", date)).unique();
  const increments = { completed: event.eventType === "comparison_completed" ? 1 : 0, failed: event.eventType === "comparison_failed" ? 1 : 0, returned: event.eventType === "comparison_returned" ? 1 : 0 };
  if (totals) await ctx.db.patch(totals._id, { completed: totals.completed + increments.completed, failed: totals.failed + increments.failed, returned: totals.returned + increments.returned });
  else await ctx.db.insert("dailyActivityTotals", { date, ...increments });
}

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireServerCredential } from "./serverAccess";
import { aggregateDashboardDailyRecords } from "../src/analytics/dashboard-contract";
import { updateDailyActivity } from "./activityAggregates";

const periodValidator = v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("custom"));
const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export const getSnapshot = query({
  args: { serverCredential: v.string(), period: periodValidator, start: v.number(), end: v.number(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    if (!Number.isFinite(args.start) || !Number.isFinite(args.end) || args.start >= args.end || args.end - args.start > 367 * 86_400_000) throw new Error("The dashboard range is invalid.");
    const startDate = dateKey(args.start); const endDate = dateKey(args.end - 1);
    const [visitors, matchups, totals] = await Promise.all([
      ctx.db.query("dailyVisitorActivity").withIndex("by_date", (q) => q.gte("date", startDate).lte("date", endDate)).collect(),
      ctx.db.query("dailyMatchupActivity").withIndex("by_date", (q) => q.gte("date", startDate).lte("date", endDate)).collect(),
      ctx.db.query("dailyActivityTotals").withIndex("by_date", (q) => q.gte("date", startDate).lte("date", endDate)).collect(),
    ]);
    return aggregateDashboardDailyRecords({ visitors, matchups, totals }, { period: args.period, start: args.start, end: args.end, from: args.from, to: args.to });
  },
});

export const backfillDailyActivity = mutation({
  args: { serverCredential: v.string() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    const existing = await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "daily-activity-v1")).unique();
    if (existing) return { backfilled: false, events: 0 };
    const oldAggregates = await Promise.all([ctx.db.query("dailyVisitorActivity").collect(), ctx.db.query("dailyMatchupActivity").collect(), ctx.db.query("dailyActivityTotals").collect()]);
    for (const group of oldAggregates) for (const row of group) await ctx.db.delete(row._id);
    const events = await ctx.db.query("visitorEvents").collect();
    for (const event of events) await updateDailyActivity(ctx, { visitorHash: event.visitorHash, eventType: event.eventType, kind: event.kind, driverId: event.driverId, constructorId: event.constructorId, rivalId: event.rivalId, countryCode: event.countryCode, occurredAt: event.occurredAt });
    await ctx.db.insert("maintenanceState", { key: "daily-activity-v1", completedAt: Date.now() });
    return { backfilled: true, events: events.length };
  },
});

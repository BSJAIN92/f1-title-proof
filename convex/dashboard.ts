import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireServerCredential } from "./serverAccess";
import { aggregateDashboardEvents, type DashboardEvent } from "../src/analytics/dashboard-contract";

const periodValidator = v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("custom"));
const eventTypes = ["visit", "comparison_completed", "comparison_failed", "comparison_returned"] as const;

export const getSnapshot = query({
  args: { serverCredential: v.string(), period: periodValidator, start: v.number(), end: v.number(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    if (!Number.isFinite(args.start) || !Number.isFinite(args.end) || args.start >= args.end || args.end - args.start > 367 * 86_400_000) throw new Error("The dashboard range is invalid.");
    const groups = await Promise.all(eventTypes.map((eventType) => ctx.db.query("visitorEvents")
      .withIndex("by_event_occurred_at", (q) => q.eq("eventType", eventType).gte("occurredAt", args.start).lt("occurredAt", args.end)).collect()));
    const events: DashboardEvent[] = groups.flat().map((event) => ({
      visitorHash: event.visitorHash, eventType: event.eventType, kind: event.kind, driverId: event.driverId, constructorId: event.constructorId,
      rivalId: event.rivalId, countryCode: event.countryCode, occurredAt: event.occurredAt,
    }));
    return aggregateDashboardEvents(events, { period: args.period, start: args.start, end: args.end, from: args.from, to: args.to });
  },
});

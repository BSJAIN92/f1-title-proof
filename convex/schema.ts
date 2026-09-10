import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  approvedDatasets: defineTable({
    dataVersion: v.string(), ruleVersion: v.string(), cutoff: v.string(), fingerprint: v.string(), status: v.literal("approved"),
    manifestJson: v.string(), sessionResultsJson: v.string(), countbackJson: v.string(), sourceDocumentsJson: v.string(), approvedAt: v.number(),
  }).index("by_status", ["status"]).index("by_data_version", ["dataVersion"]),
  anonymousVisitors: defineTable({
    visitorHash: v.string(), latestKind: v.optional(v.union(v.literal("driver"), v.literal("constructor"))), latestContenderId: v.optional(v.string()),
    latestDataVersion: v.optional(v.string()), latestRuleVersion: v.optional(v.string()), createdAt: v.number(), lastSeenAt: v.number(),
  }).index("by_visitor_hash", ["visitorHash"]),
  calculationHistory: defineTable({
    visitorHash: v.string(), kind: v.union(v.literal("driver"), v.literal("constructor")), contenderId: v.string(), dataVersion: v.string(),
    ruleVersion: v.string(), resultStatus: v.union(v.literal("COMPLETE"), v.literal("ELIMINATED")), requestedAt: v.number(),
  }).index("by_visitor_requested_at", ["visitorHash", "requestedAt"]),
  comparisonHistory: defineTable({
    visitorHash: v.string(), kind: v.union(v.literal("driver"), v.literal("constructor")), driverId: v.optional(v.string()),
    constructorId: v.optional(v.string()), rivalId: v.string(),
    dataVersion: v.string(), ruleVersion: v.string(), resultStatus: v.union(v.literal("COMPLETE"), v.literal("FAILED")),
    reason: v.optional(v.string()), requestedAt: v.number(),
  }).index("by_visitor_requested_at", ["visitorHash", "requestedAt"]),
  visitorEvents: defineTable({
    visitorHash: v.string(), eventType: v.union(v.literal("visit"), v.literal("comparison_completed"), v.literal("comparison_failed"), v.literal("comparison_returned")),
    kind: v.optional(v.union(v.literal("driver"), v.literal("constructor"))), driverId: v.optional(v.string()),
    constructorId: v.optional(v.string()), rivalId: v.optional(v.string()),
    dataVersion: v.optional(v.string()), outcome: v.optional(v.string()), countryCode: v.optional(v.string()), occurredAt: v.number(),
  }).index("by_visitor_occurred_at", ["visitorHash", "occurredAt"]).index("by_event_occurred_at", ["eventType", "occurredAt"]),
});

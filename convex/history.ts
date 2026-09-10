import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireServerCredential } from "./serverAccess";

const kindValidator = v.union(v.literal("driver"), v.literal("constructor"));
const statusValidator = v.union(v.literal("COMPLETE"), v.literal("ELIMINATED"));
const comparisonStatusValidator = v.union(v.literal("COMPLETE"), v.literal("FAILED"));
const HASH = /^[a-f0-9]{64}$/;

function requireHash(visitorHash: string) {
  if (!HASH.test(visitorHash)) throw new Error("The anonymous owner hash is invalid.");
}

async function findDataset(ctx: QueryCtx | MutationCtx, dataVersion: string, ruleVersion: string) {
  const dataset = await ctx.db.query("approvedDatasets").withIndex("by_data_version", (q) => q.eq("dataVersion", dataVersion)).unique();
  if (!dataset || dataset.ruleVersion !== ruleVersion || dataset.status !== "approved") throw new Error("The approved dataset version is unavailable.");
  return dataset;
}

function requireContender(dataset: { manifestJson: string }, kind: "driver" | "constructor", contenderId: string) {
  let manifest: unknown;
  try { manifest = JSON.parse(dataset.manifestJson); } catch { throw new Error("The approved dataset manifest is invalid."); }
  if (typeof manifest !== "object" || manifest === null) throw new Error("The approved dataset manifest is invalid.");
  const source = manifest as Record<string, unknown>;
  const rows = kind === "driver" ? source.driverStandings : source.constructorStandings;
  const key = kind === "driver" ? "driver" : "constructor";
  if (!Array.isArray(rows) || !rows.some((row) => typeof row === "object" && row !== null && (row as Record<string, unknown>)[key] === contenderId
    && (kind !== "driver" || (row as Record<string, unknown>).seasonParticipantOnly !== true))) {
    throw new Error("The contender is absent from the approved dataset.");
  }
}

async function upsertVisitor(ctx: MutationCtx, visitorHash: string, now: number) {
  const existing = await ctx.db.query("anonymousVisitors").withIndex("by_visitor_hash", (q) => q.eq("visitorHash", visitorHash)).unique();
  if (existing) {
    await ctx.db.patch(existing._id, { lastSeenAt: now });
    return existing._id;
  }
  return ctx.db.insert("anonymousVisitors", { visitorHash, createdAt: now, lastSeenAt: now });
}

export const getState = query({
  args: { serverCredential: v.string(), visitorHash: v.string() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    requireHash(args.visitorHash);
    const visitor = await ctx.db.query("anonymousVisitors").withIndex("by_visitor_hash", (q) => q.eq("visitorHash", args.visitorHash)).unique();
    const history = await ctx.db.query("calculationHistory").withIndex("by_visitor_requested_at", (q) => q.eq("visitorHash", args.visitorHash)).order("desc").take(20);
    const comparisons = await ctx.db.query("comparisonHistory").withIndex("by_visitor_requested_at", (q) => q.eq("visitorHash", args.visitorHash)).order("desc").take(20);
    return {
      latestSelection: visitor?.latestKind && visitor.latestContenderId && visitor.latestDataVersion && visitor.latestRuleVersion
        ? { kind: visitor.latestKind, contenderId: visitor.latestContenderId, dataVersion: visitor.latestDataVersion, ruleVersion: visitor.latestRuleVersion }
        : null,
      history: history.map((entry) => ({ id: entry._id, kind: entry.kind, contenderId: entry.contenderId, dataVersion: entry.dataVersion, ruleVersion: entry.ruleVersion, resultStatus: entry.resultStatus, requestedAt: entry.requestedAt })),
      comparisons: comparisons.map((entry) => ({ id: entry._id, kind: entry.kind, ...(entry.kind === "driver" ? { driverId: entry.driverId } : { constructorId: entry.constructorId }), rivalId: entry.rivalId, dataVersion: entry.dataVersion,
        ruleVersion: entry.ruleVersion, resultStatus: entry.resultStatus, reason: entry.reason, requestedAt: entry.requestedAt })),
    };
  },
});

export const recordVisit = mutation({
  args: { serverCredential: v.string(), visitorHash: v.string(), countryCode: v.optional(v.string()), occurredAt: v.number() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential); requireHash(args.visitorHash);
    if (!Number.isFinite(args.occurredAt)) throw new Error("The visit time is invalid.");
    if (args.countryCode && !/^[A-Z]{2}$/.test(args.countryCode)) throw new Error("The country code is invalid.");
    await upsertVisitor(ctx, args.visitorHash, args.occurredAt);
    return ctx.db.insert("visitorEvents", { visitorHash: args.visitorHash, eventType: "visit", countryCode: args.countryCode, occurredAt: args.occurredAt });
  },
});

export const recordComparisonReturn = mutation({
  args: { serverCredential: v.string(), visitorHash: v.string(), kind: kindValidator, driverId: v.optional(v.string()), constructorId: v.optional(v.string()), rivalId: v.string(), dataVersion: v.string(), occurredAt: v.number() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential); requireHash(args.visitorHash);
    const selectedId = args.kind === "driver" ? args.driverId : args.constructorId;
    if (!selectedId || !args.rivalId || selectedId === args.rivalId || !args.dataVersion || !Number.isFinite(args.occurredAt)) throw new Error("The comparison return event is invalid.");
    await upsertVisitor(ctx, args.visitorHash, args.occurredAt);
    const selectedField = args.kind === "driver" ? { driverId: selectedId } : { constructorId: selectedId };
    return ctx.db.insert("visitorEvents", { visitorHash: args.visitorHash, eventType: "comparison_returned", kind: args.kind, ...selectedField, rivalId: args.rivalId, dataVersion: args.dataVersion, occurredAt: args.occurredAt });
  },
});

export const recordComparison = mutation({
  args: { serverCredential: v.string(), visitorHash: v.string(), kind: kindValidator, driverId: v.optional(v.string()), constructorId: v.optional(v.string()), rivalId: v.string(), dataVersion: v.string(),
    ruleVersion: v.string(), resultStatus: comparisonStatusValidator, reason: v.optional(v.string()), requestedAt: v.number() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential); requireHash(args.visitorHash);
    const selectedId = args.kind === "driver" ? args.driverId : args.constructorId;
    if (!selectedId || !args.rivalId || selectedId === args.rivalId || !Number.isFinite(args.requestedAt)) throw new Error("The comparison history request is invalid.");
    const visitorId = await upsertVisitor(ctx, args.visitorHash, args.requestedAt);
    await ctx.db.patch(visitorId, { lastSeenAt: args.requestedAt });
    const selectedField = args.kind === "driver" ? { driverId: selectedId } : { constructorId: selectedId };
    const historyId = await ctx.db.insert("comparisonHistory", { visitorHash: args.visitorHash, kind: args.kind, ...selectedField, rivalId: args.rivalId,
      dataVersion: args.dataVersion, ruleVersion: args.ruleVersion, resultStatus: args.resultStatus, reason: args.reason, requestedAt: args.requestedAt });
    await ctx.db.insert("visitorEvents", { visitorHash: args.visitorHash, eventType: args.resultStatus === "COMPLETE" ? "comparison_completed" : "comparison_failed",
      kind: args.kind, ...selectedField, rivalId: args.rivalId, dataVersion: args.dataVersion, outcome: args.resultStatus, occurredAt: args.requestedAt });
    return historyId;
  },
});

export const saveSelection = mutation({
  args: { serverCredential: v.string(), visitorHash: v.string(), kind: kindValidator, contenderId: v.string(), dataVersion: v.string(), ruleVersion: v.string() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    requireHash(args.visitorHash);
    if (!args.contenderId) throw new Error("A contender is required.");
    const dataset = await findDataset(ctx, args.dataVersion, args.ruleVersion);
    requireContender(dataset, args.kind, args.contenderId);
    const now = Date.now();
    const visitorId = await upsertVisitor(ctx, args.visitorHash, now);
    await ctx.db.patch(visitorId, { latestKind: args.kind, latestContenderId: args.contenderId, latestDataVersion: args.dataVersion, latestRuleVersion: args.ruleVersion, lastSeenAt: now });
    return { saved: true };
  },
});

export const recordCalculation = mutation({
  args: { serverCredential: v.string(), visitorHash: v.string(), kind: kindValidator, contenderId: v.string(), dataVersion: v.string(), ruleVersion: v.string(), resultStatus: statusValidator, requestedAt: v.number() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    requireHash(args.visitorHash);
    if (!args.contenderId || !Number.isFinite(args.requestedAt)) throw new Error("The calculation history request is invalid.");
    const dataset = await findDataset(ctx, args.dataVersion, args.ruleVersion);
    requireContender(dataset, args.kind, args.contenderId);
    const visitorId = await upsertVisitor(ctx, args.visitorHash, args.requestedAt);
    await ctx.db.patch(visitorId, { latestKind: args.kind, latestContenderId: args.contenderId, latestDataVersion: args.dataVersion, latestRuleVersion: args.ruleVersion, lastSeenAt: args.requestedAt });
    return ctx.db.insert("calculationHistory", {
      visitorHash: args.visitorHash,
      kind: args.kind,
      contenderId: args.contenderId,
      dataVersion: args.dataVersion,
      ruleVersion: args.ruleVersion,
      resultStatus: args.resultStatus,
      requestedAt: args.requestedAt,
    });
  },
});

export const getOwnedEntry = query({
  args: { serverCredential: v.string(), visitorHash: v.string(), historyId: v.id("calculationHistory") },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    requireHash(args.visitorHash);
    const entry = await ctx.db.get(args.historyId);
    if (!entry || entry.visitorHash !== args.visitorHash) return null;
    return { id: entry._id, visitorHash: entry.visitorHash, kind: entry.kind, contenderId: entry.contenderId, dataVersion: entry.dataVersion, ruleVersion: entry.ruleVersion, resultStatus: entry.resultStatus, requestedAt: entry.requestedAt };
  },
});

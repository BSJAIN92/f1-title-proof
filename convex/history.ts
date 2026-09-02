import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireServerCredential } from "./serverAccess";

const kindValidator = v.union(v.literal("driver"), v.literal("constructor"));
const statusValidator = v.union(v.literal("COMPLETE"), v.literal("ELIMINATED"));
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
    return {
      latestSelection: visitor?.latestKind && visitor.latestContenderId && visitor.latestDataVersion && visitor.latestRuleVersion
        ? { kind: visitor.latestKind, contenderId: visitor.latestContenderId, dataVersion: visitor.latestDataVersion, ruleVersion: visitor.latestRuleVersion }
        : null,
      history: history.map((entry) => ({ id: entry._id, kind: entry.kind, contenderId: entry.contenderId, dataVersion: entry.dataVersion, ruleVersion: entry.ruleVersion, resultStatus: entry.resultStatus, requestedAt: entry.requestedAt })),
    };
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

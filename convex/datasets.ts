import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireServerCredential } from "./serverAccess";

function publicDataset(document: {
  dataVersion: string; ruleVersion: string; cutoff: string; fingerprint: string; status: "approved";
  manifestJson: string; sessionResultsJson: string; countbackJson: string; sourceDocumentsJson: string; approvedAt: number;
}) {
  return {
    dataVersion: document.dataVersion, ruleVersion: document.ruleVersion, cutoff: document.cutoff, fingerprint: document.fingerprint,
    status: document.status, manifestJson: document.manifestJson, sessionResultsJson: document.sessionResultsJson,
    countbackJson: document.countbackJson, sourceDocumentsJson: document.sourceDocumentsJson, approvedAt: document.approvedAt,
  };
}

export const getActive = query({
  args: { serverCredential: v.string() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    const datasets = await ctx.db.query("approvedDatasets").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    if (datasets.length === 0) return null;
    datasets.sort((left, right) => right.approvedAt - left.approvedAt);
    return publicDataset(datasets[0]);
  },
});

export const getByVersion = query({
  args: { serverCredential: v.string(), dataVersion: v.string() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    if (!args.dataVersion) throw new Error("A data version is required.");
    const document = await ctx.db.query("approvedDatasets").withIndex("by_data_version", (q) => q.eq("dataVersion", args.dataVersion)).unique();
    return document ? publicDataset(document) : null;
  },
});

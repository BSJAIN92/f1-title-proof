import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const seedApproved = internalMutation({
  args: {
    dataVersion: v.string(), ruleVersion: v.string(), cutoff: v.string(), fingerprint: v.string(), status: v.literal("approved"),
    manifestJson: v.string(), sessionResultsJson: v.string(), countbackJson: v.string(), sourceDocumentsJson: v.string(), approvedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!/^sha256-[a-f0-9]{64}$/.test(args.fingerprint)) throw new Error("The verified dataset fingerprint is invalid.");
    const existing = await ctx.db.query("approvedDatasets").withIndex("by_data_version", (q) => q.eq("dataVersion", args.dataVersion)).unique();
    if (!existing) return { inserted: true, id: await ctx.db.insert("approvedDatasets", args) };
    if (existing.ruleVersion !== args.ruleVersion || existing.cutoff !== args.cutoff || existing.fingerprint !== args.fingerprint || existing.status !== args.status
      || existing.manifestJson !== args.manifestJson || existing.sessionResultsJson !== args.sessionResultsJson || existing.countbackJson !== args.countbackJson
      || existing.sourceDocumentsJson !== args.sourceDocumentsJson || existing.approvedAt !== args.approvedAt) {
      throw new Error("Conflicting bytes already exist for this approved data version.");
    }
    return { inserted: false, id: existing._id };
  },
});

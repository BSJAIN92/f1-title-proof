"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { APPROVED_FROZEN_DATA } from "../src/engine/relations/approved-frozen-constants";
import { verifyFrozenDriverSnapshot } from "../src/engine/relations/verified-frozen-driver-snapshot";
import { requireDeploymentCredential } from "./serverAccess";

const seedArgs = {
  deploymentCredential: v.string(),
  dataVersion: v.string(), ruleVersion: v.string(), cutoff: v.string(), fingerprint: v.string(), status: v.literal("approved"),
  manifestJson: v.string(), sessionResultsJson: v.string(), countbackJson: v.string(), sourceDocumentsJson: v.string(), approvedAt: v.number(),
};

export const seedApproved = action({
  args: seedArgs,
  handler: async (ctx, args): Promise<{ inserted: boolean; id: string }> => {
    requireDeploymentCredential(args.deploymentCredential);
    const document = {
      dataVersion: args.dataVersion,
      ruleVersion: args.ruleVersion,
      cutoff: args.cutoff,
      fingerprint: args.fingerprint,
      status: args.status,
      manifestJson: args.manifestJson,
      sessionResultsJson: args.sessionResultsJson,
      countbackJson: args.countbackJson,
      sourceDocumentsJson: args.sourceDocumentsJson,
      approvedAt: args.approvedAt,
    };
    const verified = verifyFrozenDriverSnapshot({
      manifestBytes: new TextEncoder().encode(document.manifestJson),
      artifactBytes: {
        "session-results.json": new TextEncoder().encode(document.sessionResultsJson),
        "countback.json": new TextEncoder().encode(document.countbackJson),
        "source-documents.json": new TextEncoder().encode(document.sourceDocumentsJson),
      },
    });
    if (verified.status !== "VERIFIED") throw new Error(`The approved seed failed verification: ${verified.reason}`);
    if (document.dataVersion !== verified.snapshot.dataVersion || document.ruleVersion !== verified.snapshot.ruleVersion || document.cutoff !== verified.snapshot.cutoff
      || document.fingerprint !== verified.snapshot.fingerprint || document.status !== "approved" || document.dataVersion !== APPROVED_FROZEN_DATA.dataVersion) {
      throw new Error("The approved seed metadata does not match its verified bytes.");
    }
    return await ctx.runMutation(internal.seed.seedApproved, document);
  },
});

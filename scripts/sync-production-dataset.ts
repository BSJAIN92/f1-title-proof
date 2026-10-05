import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { approvedDatasetFixture } from "../src/test/approved-frozen-fixture";

const convex = resolve("node_modules", "convex", "bin", "main.js");
const credential = (name: "CONVEX_SERVER_CREDENTIAL" | "CONVEX_SEED_CREDENTIAL") =>
  execFileSync(process.execPath, [convex, "env", "get", name, "--prod"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const url = "https://veracious-eagle-213.convex.cloud";
const serverCredential = credential("CONVEX_SERVER_CREDENTIAL");
const deploymentCredential = credential("CONVEX_SEED_CREDENTIAL");
if (serverCredential.length < 32 || deploymentCredential.length < 32) throw new Error("Production credentials are unavailable.");

const client = new ConvexHttpClient(url);
let comparisons = 0;
let events = 0;
for (let batch = 0; batch < 10_000; batch += 1) {
  const result = await client.mutation(api.history.migrateLegacyComparisonIds, { serverCredential, batchSize: 100 });
  comparisons += result.comparisons;
  events += result.events;
  if (result.comparisons === 0 && result.events === 0) break;
  if (batch === 9_999) throw new Error("The production comparison migration exceeded 10,000 batches.");
}
const seeded = await client.action(api.seedNode.seedApproved, { ...approvedDatasetFixture(), deploymentCredential });
const active = await client.query(api.datasets.getActive, { serverCredential });
const activeManifest = active ? JSON.parse(active.manifestJson) as { remainingSessions: unknown[] } : null;
process.stdout.write(`${JSON.stringify({ migrated: { comparisons, events }, seeded, active: active ? { dataVersion: active.dataVersion, remainingSessions: activeManifest?.remainingSessions.length } : null })}\n`);

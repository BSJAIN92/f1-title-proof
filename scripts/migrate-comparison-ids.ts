import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
const serverCredential = process.env.CONVEX_SERVER_CREDENTIAL;
if (!serverCredential || serverCredential.length < 32) throw new Error("CONVEX_SERVER_CREDENTIAL must be configured with at least 32 characters.");

const client = new ConvexHttpClient(url);
let comparisons = 0;
let events = 0;
for (let batch = 0; batch < 10_000; batch += 1) {
  const result = await client.mutation(api.history.migrateLegacyComparisonIds, { serverCredential, batchSize: 100 });
  comparisons += result.comparisons;
  events += result.events;
  if (result.comparisons === 0 && result.events === 0) {
    process.stdout.write(`${JSON.stringify({ migrated: { comparisons, events } })}\n`);
    process.exit(0);
  }
}
throw new Error("The comparison ID migration exceeded 10,000 batches.");

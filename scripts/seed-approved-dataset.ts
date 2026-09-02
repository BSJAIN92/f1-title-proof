import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { approvedDatasetFixture } from "../src/test/approved-frozen-fixture";

const document = approvedDatasetFixture();
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required. Run `npx convex init` first.");
const deploymentCredential = process.env.CONVEX_SEED_CREDENTIAL;
if (!deploymentCredential || deploymentCredential.length < 32) throw new Error("CONVEX_SEED_CREDENTIAL must be configured with at least 32 characters.");
const client = new ConvexHttpClient(url);
const result = await client.action(api.seedNode.seedApproved, { ...document, deploymentCredential });
process.stdout.write(`${JSON.stringify(result)}\n`);

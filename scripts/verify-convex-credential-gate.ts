import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { approvedDatasetFixture } from "../src/test/approved-frozen-fixture";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const serverCredential = process.env.CONVEX_SERVER_CREDENTIAL;
const deploymentCredential = process.env.CONVEX_SEED_CREDENTIAL;
if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
if (!serverCredential || serverCredential.length < 32) throw new Error("CONVEX_SERVER_CREDENTIAL must contain at least 32 characters.");
if (!deploymentCredential || deploymentCredential.length < 32) throw new Error("CONVEX_SEED_CREDENTIAL must contain at least 32 characters.");

const client = new ConvexHttpClient(url);
const document = approvedDatasetFixture();
const wrongCredential = `${serverCredential.slice(1)}${serverCredential[0]}`;
const wrongDeploymentCredential = `${deploymentCredential.slice(1)}${deploymentCredential[0]}`;
const selection = {
  kind: "driver" as const,
  contenderId: "Kimi Antonelli",
  dataVersion: document.dataVersion,
  ruleVersion: document.ruleVersion,
};
const visitorHash = "c".repeat(64);

async function expectAccessRejected(label: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Server access was rejected")) return;
    throw new Error(`${label} failed for a reason other than the credential gate: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`${label} accepted an invalid credential.`);
}

await expectAccessRejected("dataset query", () => client.query(api.datasets.getActive, { serverCredential: wrongCredential }));
await expectAccessRejected("seed action", () => client.action(api.seedNode.seedApproved, { ...document, deploymentCredential: wrongDeploymentCredential }));

await client.action(api.seedNode.seedApproved, { ...document, deploymentCredential });
const active = await client.query(api.datasets.getActive, { serverCredential });
if (!active || active.dataVersion !== document.dataVersion) throw new Error("A valid server credential could not load the approved dataset.");

const historyId = await client.mutation(api.history.recordCalculation, {
  ...selection,
  visitorHash,
  serverCredential,
  resultStatus: "COMPLETE",
  requestedAt: Date.now(),
});

await expectAccessRejected("versioned dataset query", () => client.query(api.datasets.getByVersion, { dataVersion: document.dataVersion, serverCredential: wrongCredential }));
await expectAccessRejected("history state query", () => client.query(api.history.getState, { visitorHash, serverCredential: wrongCredential }));
await expectAccessRejected("selection mutation", () => client.mutation(api.history.saveSelection, { ...selection, visitorHash, serverCredential: wrongCredential }));
await expectAccessRejected("history mutation", () => client.mutation(api.history.recordCalculation, { ...selection, visitorHash, serverCredential: wrongCredential, resultStatus: "COMPLETE", requestedAt: Date.now() }));
await expectAccessRejected("owned history query", () => client.query(api.history.getOwnedEntry, { visitorHash, historyId, serverCredential: wrongCredential }));

const state = await client.query(api.history.getState, { visitorHash, serverCredential });
const owned = await client.query(api.history.getOwnedEntry, { visitorHash, historyId, serverCredential });
if (!state.history.some((entry) => entry.id === historyId) || !owned || owned.id !== historyId) {
  throw new Error("Valid server-mediated history calls did not round-trip.");
}

process.stdout.write("Convex credential gates passed: invalid direct calls rejected; authorized dataset, seed, and history calls succeeded.\n");

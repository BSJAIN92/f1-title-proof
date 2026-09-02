import "server-only";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import {
  isVisitorHash,
  parseAnonymousState,
  parseHistoryEntry,
  type AnonymousState,
  type SelectionSummary,
} from "../convex/contracts";
import { calculateScenarioFromSnapshot, type CalculateRequest, type ResultView } from "../product/calculate-scenario";
import { productDataFromSnapshot, verifyStoredDataset } from "../product/convex-dataset-runtime";
import type { ProductData } from "../product/frozen-product-data";

export type StoreFailureCode = "MISSING_URL" | "MISSING_CREDENTIAL" | "UNAVAILABLE" | "MISSING_DATA" | "INVALID_DATA" | "INVALID_REQUEST" | "STALE" | "WRITE_REJECTED" | "NOT_FOUND";

export class StoreFailure extends Error {
  constructor(public readonly code: StoreFailureCode, message: string) {
    super(message);
    this.name = "StoreFailure";
  }
}

function options() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new StoreFailure("MISSING_URL", "Convex is not configured for this deployment.");
  const serverCredential = process.env.CONVEX_SERVER_CREDENTIAL;
  if (!serverCredential || serverCredential.length < 32) throw new StoreFailure("MISSING_CREDENTIAL", "The server-to-Convex connection is not configured for this deployment.");
  return { url, serverCredential };
}

function requireHash(hash: string) {
  if (!isVisitorHash(hash)) throw new StoreFailure("INVALID_REQUEST", "The anonymous browser identity is invalid.");
}

function requireSelection(selection: SelectionSummary | CalculateRequest) {
  if ((selection.kind !== "driver" && selection.kind !== "constructor") || !selection.contenderId || !selection.dataVersion || !selection.ruleVersion) {
    throw new StoreFailure("INVALID_REQUEST", "The contender selection is malformed.");
  }
}

async function query<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof StoreFailure) throw error;
    throw new StoreFailure("UNAVAILABLE", error instanceof Error ? `Convex is unavailable: ${error.message}` : "Convex is unavailable.");
  }
}

async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof StoreFailure) throw error;
    throw new StoreFailure("WRITE_REJECTED", error instanceof Error ? `Convex rejected the write: ${error.message}` : "Convex rejected the write.");
  }
}

async function loadVerifiedDataset(dataVersion?: string) {
  const access = options();
  const document = await query(() => dataVersion
    ? fetchQuery(api.datasets.getByVersion, { dataVersion, serverCredential: access.serverCredential }, { url: access.url })
    : fetchQuery(api.datasets.getActive, { serverCredential: access.serverCredential }, { url: access.url }));
  if (!document) throw new StoreFailure("MISSING_DATA", dataVersion ? "That approved dataset version is unavailable." : "No approved dataset is available.");
  const verification = verifyStoredDataset(document);
  if (verification.status !== "VERIFIED") throw new StoreFailure("INVALID_DATA", verification.reason);
  if (dataVersion && verification.document.dataVersion !== dataVersion) throw new StoreFailure("STALE", "Convex returned a different dataset version.");
  return verification.snapshot;
}

export async function loadActiveProductData(): Promise<ProductData> {
  return productDataFromSnapshot(await loadVerifiedDataset());
}

export async function loadAnonymousState(visitorHash: string): Promise<AnonymousState> {
  requireHash(visitorHash);
  const access = options();
  const value = await query(() => fetchQuery(api.history.getState, { visitorHash, serverCredential: access.serverCredential }, { url: access.url }));
  try { return parseAnonymousState(value); }
  catch (error) { throw new StoreFailure("INVALID_DATA", error instanceof Error ? error.message : "The stored anonymous state is malformed."); }
}

export async function saveSelection(visitorHash: string, selection: SelectionSummary): Promise<{ saved: true }> {
  requireHash(visitorHash);
  requireSelection(selection);
  const access = options();
  const value = await mutate(() => fetchMutation(api.history.saveSelection, { visitorHash, ...selection, serverCredential: access.serverCredential }, { url: access.url }));
  if (!value || value.saved !== true) throw new StoreFailure("WRITE_REJECTED", "Convex did not confirm the selection write.");
  return { saved: true };
}

export async function calculateAndRecord(visitorHash: string, request: CalculateRequest): Promise<ResultView> {
  requireHash(visitorHash);
  requireSelection(request);
  const snapshot = await loadVerifiedDataset(request.dataVersion);
  const result = calculateScenarioFromSnapshot(snapshot, request);
  if (result.status === "ERROR") throw new StoreFailure(result.reason?.includes("stale") ? "STALE" : "INVALID_REQUEST", result.reason ?? "The calculation failed.");
  const resultStatus = result.status === "COMPLETE" ? "COMPLETE" : "ELIMINATED";
  const access = options();
  await mutate(() => fetchMutation(api.history.recordCalculation, {
    visitorHash,
    serverCredential: access.serverCredential,
    kind: request.kind,
    contenderId: request.contenderId,
    dataVersion: result.dataVersion,
    ruleVersion: result.ruleVersion,
    resultStatus,
    requestedAt: Date.now(),
  }, { url: access.url }));
  return result;
}

export async function reopenOwnedHistory(visitorHash: string, historyId: string): Promise<ResultView> {
  requireHash(visitorHash);
  if (!historyId) throw new StoreFailure("INVALID_REQUEST", "A history entry is required.");
  const access = options();
  const value = await query(() => fetchQuery(api.history.getOwnedEntry, { visitorHash, historyId: historyId as Id<"calculationHistory">, serverCredential: access.serverCredential }, { url: access.url }));
  if (!value) throw new StoreFailure("NOT_FOUND", "That calculation is unavailable for this browser.");
  let entry;
  try { entry = parseHistoryEntry(value); }
  catch (error) { throw new StoreFailure("INVALID_DATA", error instanceof Error ? error.message : "The stored history entry is malformed."); }
  if (entry.visitorHash !== visitorHash) throw new StoreFailure("NOT_FOUND", "That calculation is unavailable for this browser.");
  const snapshot = await loadVerifiedDataset(entry.dataVersion);
  const result = calculateScenarioFromSnapshot(snapshot, entry);
  if (result.status === "ERROR") throw new StoreFailure(result.reason?.includes("stale") ? "STALE" : "INVALID_DATA", result.reason ?? "The stored calculation cannot be reopened.");
  return result;
}

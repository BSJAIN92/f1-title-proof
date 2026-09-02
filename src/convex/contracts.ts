export type ChampionshipKind = "driver" | "constructor";
export type CalculationStatus = "COMPLETE" | "ELIMINATED";

export interface ApprovedDatasetDocument {
  readonly dataVersion: string;
  readonly ruleVersion: string;
  readonly cutoff: string;
  readonly fingerprint: string;
  readonly status: "approved";
  readonly manifestJson: string;
  readonly sessionResultsJson: string;
  readonly countbackJson: string;
  readonly sourceDocumentsJson: string;
  readonly approvedAt: number;
}
export interface SelectionSummary {
  readonly kind: ChampionshipKind;
  readonly contenderId: string;
  readonly dataVersion: string;
  readonly ruleVersion: string;
}

export interface HistorySummary extends SelectionSummary {
  readonly id: string;
  readonly resultStatus: CalculationStatus;
  readonly requestedAt: number;
}

export interface AnonymousState {
  readonly latestSelection: SelectionSummary | null;
  readonly history: readonly HistorySummary[];
}

export interface StoredHistoryEntry extends HistorySummary {
  readonly visitorHash: string;
}

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isKind = (value: unknown): value is ChampionshipKind => value === "driver" || value === "constructor";
const isStatus = (value: unknown): value is CalculationStatus => value === "COMPLETE" || value === "ELIMINATED";
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function parseApprovedDataset(value: unknown): ApprovedDatasetDocument {
  if (!isRecord(value) || !isNonEmpty(value.dataVersion) || !isNonEmpty(value.ruleVersion) || !isNonEmpty(value.cutoff)
    || typeof value.fingerprint !== "string" || !/^sha256-[a-f0-9]{64}$/.test(value.fingerprint) || value.status !== "approved"
    || !isNonEmpty(value.manifestJson) || !isNonEmpty(value.sessionResultsJson) || !isNonEmpty(value.countbackJson)
    || !isNonEmpty(value.sourceDocumentsJson) || typeof value.approvedAt !== "number" || !Number.isFinite(value.approvedAt)) {
    throw new Error("The approved Convex dataset document is malformed.");
  }
  return {
    dataVersion: value.dataVersion,
    ruleVersion: value.ruleVersion,
    cutoff: value.cutoff,
    fingerprint: value.fingerprint,
    status: "approved",
    manifestJson: value.manifestJson,
    sessionResultsJson: value.sessionResultsJson,
    countbackJson: value.countbackJson,
    sourceDocumentsJson: value.sourceDocumentsJson,
    approvedAt: value.approvedAt,
  };
}

function parseSelection(value: unknown): SelectionSummary | null {
  if (value === null) return null;
  if (!isRecord(value) || !isKind(value.kind) || !isNonEmpty(value.contenderId) || !isNonEmpty(value.dataVersion) || !isNonEmpty(value.ruleVersion)) {
    throw new Error("The anonymous selection is malformed.");
  }
  return { kind: value.kind, contenderId: value.contenderId, dataVersion: value.dataVersion, ruleVersion: value.ruleVersion };
}

export function parseHistoryEntry(value: unknown): StoredHistoryEntry {
  if (!isRecord(value) || !isNonEmpty(value.id) || !isHash(value.visitorHash) || !isKind(value.kind) || !isNonEmpty(value.contenderId)
    || !isNonEmpty(value.dataVersion) || !isNonEmpty(value.ruleVersion) || !isStatus(value.resultStatus)
    || typeof value.requestedAt !== "number" || !Number.isFinite(value.requestedAt)) {
    throw new Error("The anonymous history entry is malformed.");
  }
  return { id: value.id, visitorHash: value.visitorHash, kind: value.kind, contenderId: value.contenderId, dataVersion: value.dataVersion, ruleVersion: value.ruleVersion, resultStatus: value.resultStatus, requestedAt: value.requestedAt };
}

export function parseAnonymousState(value: unknown): AnonymousState {
  if (!isRecord(value) || !Array.isArray(value.history) || value.history.length > 20) throw new Error("The anonymous Convex state is malformed.");
  const history = value.history.map((item) => {
    if (!isRecord(item) || !isNonEmpty(item.id) || !isKind(item.kind) || !isNonEmpty(item.contenderId) || !isNonEmpty(item.dataVersion)
      || !isNonEmpty(item.ruleVersion) || !isStatus(item.resultStatus) || typeof item.requestedAt !== "number" || !Number.isFinite(item.requestedAt)) {
      throw new Error("The anonymous history summary is malformed.");
    }
    return { id: item.id, kind: item.kind, contenderId: item.contenderId, dataVersion: item.dataVersion, ruleVersion: item.ruleVersion, resultStatus: item.resultStatus, requestedAt: item.requestedAt };
  });
  return { latestSelection: parseSelection(value.latestSelection), history };
}

export function isVisitorHash(value: unknown): value is string {
  return isHash(value);
}

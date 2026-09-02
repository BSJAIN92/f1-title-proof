import { describe, expect, it } from "vitest";
import { parseAnonymousState, parseApprovedDataset, parseHistoryEntry } from "./contracts";

describe("Convex storage contracts", () => {
  it("accepts the approved dataset shape", () => {
    const document = {
      dataVersion: "2026-09-01T21:14:22+05:30", ruleVersion: "rules", cutoff: "2026-09-01T21:14:22+05:30",
      fingerprint: `sha256-${"a".repeat(64)}`, status: "approved", manifestJson: "{}", sessionResultsJson: "{}",
      countbackJson: "{}", sourceDocumentsJson: "{}", approvedAt: 1,
    };
    expect(parseApprovedDataset(document).dataVersion).toBe("2026-09-01T21:14:22+05:30");
  });

  it("accepts an empty anonymous state", () => {
    expect(parseAnonymousState({ latestSelection: null, history: [] })).toEqual({ latestSelection: null, history: [] });
  });

  it("never accepts a raw browser identifier as an owner hash", () => {
    expect(() => parseHistoryEntry({ visitorHash: "raw-cookie" })).toThrow();
  });
});

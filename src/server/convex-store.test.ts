import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvedDatasetFixture } from "../test/approved-frozen-fixture";

const convex = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchQuery: convex.query, fetchMutation: convex.mutation }));

import {
  calculateAndRecord,
  loadActiveProductData,
  loadAnonymousState,
  reopenOwnedHistory,
  saveSelection,
} from "./convex-store";

const hash = "a".repeat(64);
const serverCredential = "server-test-credential".padEnd(32, "x");
const selection = { kind: "driver" as const, contenderId: "Kimi Antonelli", dataVersion: "2026-09-01T21:14:22+05:30", ruleVersion: "fia-2026-section-a-issue-03_section-b-issue-08_v1-full-points" };

describe("Convex store bridge", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://127.0.0.1:3210");
    vi.stubEnv("CONVEX_SERVER_CREDENTIAL", serverCredential);
    convex.query.mockReset();
    convex.mutation.mockReset();
  });

  it("loads and verifies active product data", async () => {
    convex.query.mockResolvedValueOnce(approvedDatasetFixture());
    await expect(loadActiveProductData()).resolves.toMatchObject({ dataVersion: selection.dataVersion, remainingSessions: 12 });
    expect(convex.query).toHaveBeenCalledWith(expect.anything(), { serverCredential }, { url: "http://127.0.0.1:3210" });
  });

  it("validates anonymous state before returning it", async () => {
    convex.query.mockResolvedValueOnce({ latestSelection: null, history: [] });
    await expect(loadAnonymousState(hash)).resolves.toEqual({ latestSelection: null, history: [] });
    convex.query.mockResolvedValueOnce({ latestSelection: null, history: [{ id: "bad" }] });
    await expect(loadAnonymousState(hash)).rejects.toMatchObject({ code: "INVALID_DATA" });
  });

  it("saves a validated selection", async () => {
    convex.mutation.mockResolvedValueOnce({ saved: true });
    await expect(saveSelection(hash, selection)).resolves.toEqual({ saved: true });
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ serverCredential }), { url: "http://127.0.0.1:3210" });
  });

  it("calculates from the exact stored version and records complete or eliminated results", async () => {
    convex.query.mockResolvedValueOnce(approvedDatasetFixture());
    convex.mutation.mockResolvedValueOnce("history-id");
    const result = await calculateAndRecord(hash, selection);
    expect(result.status).toBe("COMPLETE");
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ visitorHash: hash, resultStatus: "COMPLETE" }), expect.anything());
  });

  it("reopens only an owned entry and never writes a duplicate", async () => {
    convex.query
      .mockResolvedValueOnce({ id: "history-id", visitorHash: hash, ...selection, resultStatus: "COMPLETE", requestedAt: 1 })
      .mockResolvedValueOnce(approvedDatasetFixture());
    const result = await reopenOwnedHistory(hash, "history-id");
    expect(result.status).toBe("COMPLETE");
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("reports missing configuration and unavailable owned entries explicitly", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");
    await expect(loadActiveProductData()).rejects.toMatchObject({ code: "MISSING_URL" });
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://127.0.0.1:3210");
    convex.query.mockResolvedValueOnce(null);
    await expect(reopenOwnedHistory(hash, "history-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.stubEnv("CONVEX_SERVER_CREDENTIAL", "");
    await expect(loadActiveProductData()).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });
});

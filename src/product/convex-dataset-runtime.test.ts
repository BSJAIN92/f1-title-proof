import { describe, expect, it } from "vitest";
import { approvedDatasetFixture } from "../test/approved-frozen-fixture";
import { calculateScenarioFromSnapshot } from "./calculate-scenario";
import { productDataFromSnapshot, verifyStoredDataset } from "./convex-dataset-runtime";

describe("Convex dataset runtime", () => {
  it("verifies stored exact bytes and derives the approved product view", () => {
    const verified = verifyStoredDataset(approvedDatasetFixture());
    expect(verified.status).toBe("VERIFIED");
    if (verified.status !== "VERIFIED") return;
    const data = productDataFromSnapshot(verified.snapshot);
    expect(data).toMatchObject({ dataVersion: "2026-09-27T09:46:00+05:30", remainingSessions: 9, remaining: { races: 8, sprints: 1, maximumPoints: { driver: { races: 200, sprints: 8, total: 208 }, constructor: { races: 344, sprints: 15, total: 359 } } } });
    expect(data.standings.driver).toHaveLength(22);
    expect(data.standings.constructor).toHaveLength(11);
    expect(data.standings.driver.find(({ id }) => id === "George Russell")?.eligible).toBe(true);
    expect(data.standings.driver.find(({ id }) => id === "Pierre Gasly")?.eligible).toBe(false);
    expect(data.standings.constructor.find(({ id }) => id === "Oracle Red Bull Racing")?.eligible).toBe(true);
    expect(data.standings.constructor.find(({ id }) => id === "Visa Cash App Racing Bulls F1 Team")?.eligible).toBe(false);
  });

  it("rejects changed stored bytes", () => {
    const document = approvedDatasetFixture();
    expect(verifyStoredDataset({ ...document, sessionResultsJson: `${document.sessionResultsJson} ` }).status).toBe("CALCULATION_FAILURE");
  });

  it.each([["driver", "Kimi Antonelli"], ["constructor", "Mercedes-AMG PETRONAS F1 Team"]] as const)("preserves the %s proof", (kind, contenderId) => {
    const verified = verifyStoredDataset(approvedDatasetFixture());
    if (verified.status !== "VERIFIED") throw new Error(verified.reason);
    const result = calculateScenarioFromSnapshot(verified.snapshot, { kind, contenderId, dataVersion: verified.snapshot.dataVersion, ruleVersion: verified.snapshot.ruleVersion });
    expect(result.status).toBe("COMPLETE");
    expect(result.groups?.map((group) => group.id)).toEqual(["POINTS_AHEAD", "COUNTBACK_WIN"]);
  });
});

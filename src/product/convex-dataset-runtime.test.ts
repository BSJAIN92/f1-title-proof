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
    expect(data).toMatchObject({ dataVersion: "2026-09-10T12:30:00+05:30", remainingSessions: 11, remaining: { races: 10, sprints: 1, maximumPoints: { driver: { races: 250, sprints: 8, total: 258 }, constructor: { races: 430, sprints: 15, total: 445 } } } });
    expect(data.standings.driver).toHaveLength(22);
    expect(data.standings.constructor).toHaveLength(11);
    expect(data.standings.driver.find(({ id }) => id === "Gabriel Bortoleto")?.eligible).toBe(true);
    expect(data.standings.driver.find(({ id }) => id === "Nico Hulkenberg")?.eligible).toBe(false);
    expect(data.standings.constructor.find(({ id }) => id === "BWT Alpine F1 Team")?.eligible).toBe(true);
    expect(data.standings.constructor.find(({ id }) => id === "TGR Haas F1 Team")?.eligible).toBe(false);
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

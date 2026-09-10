import { describe, expect, it } from "vitest";
import { approvedSnapshotFixture } from "../test/approved-frozen-fixture";
import { calculateGuaranteedScenarioPage, scenarioOutcomes } from "./guaranteed-scenarios";

const snapshot = approvedSnapshotFixture();
const request = (kind: "driver" | "constructor", contenderId: string, cursor?: string) => ({
  kind, contenderId, dataVersion: snapshot.dataVersion, ruleVersion: snapshot.ruleVersion, ...(cursor ? { cursor } : {}),
});

describe("guaranteed scenario groups", () => {
  it("uses scoring finishes plus one zero-point bucket for drivers", () => {
    expect(scenarioOutcomes("driver", "race").map(item => item.points).sort((a,b) => b-a)).toEqual([25,18,15,12,10,8,6,4,2,1,0]);
    expect(scenarioOutcomes("driver", "sprint").map(item => item.points).sort((a,b) => b-a)).toEqual([8,7,6,5,4,3,2,1,0]);
  });

  it("uses legal unordered paired finishes for constructors", () => {
    const race = scenarioOutcomes("constructor", "race");
    expect(race).toHaveLength(56);
    expect(race).toContainEqual(expect.objectContaining({ label: "P1 + P2", points: 43 }));
    expect(race.some(item => item.label === "P1 + P1")).toBe(false);
    expect(race).toContainEqual(expect.objectContaining({ label: "0 points + 0 points", points: 0 }));
  });

  it("returns lowest-points driver guarantees in bounded pages", () => {
    const result = calculateGuaranteedScenarioPage(snapshot, request("driver", "Kimi Antonelli"));
    if ("status" in result) throw new Error(result.reason);
    expect(result.items).toHaveLength(25);
    expect(result.nextCursor).toBeTruthy();
    expect(result.items.every((item, index, rows) => index === 0 || rows[index - 1].additionalPoints <= item.additionalPoints)).toBe(true);
    expect(result.items.every(item => item.races.reduce((sum, group) => sum + group.count, 0) === 10)).toBe(true);
    expect(result.items.every(item => item.finalPoints > result.strongestRivalPoints)).toBe(true);
  });

  it("pages constructor guarantees without enumerating the search space", () => {
    const first = calculateGuaranteedScenarioPage(snapshot, request("constructor", "Mercedes-AMG PETRONAS F1 Team"));
    if ("status" in first) throw new Error(first.reason);
    expect(first.items).toHaveLength(25);
    expect(first.items.every(item => item.races.reduce((sum, group) => sum + group.count, 0) === 10)).toBe(true);
    const second = calculateGuaranteedScenarioPage(snapshot, request("constructor", first.contenderId, first.nextCursor!));
    if ("status" in second) throw new Error(second.reason);
    expect(new Set([...first.items, ...second.items].map(item => item.key)).size).toBe(50);
  });

  it("rejects hidden contenders, stale data, and mismatched cursors", () => {
    expect(calculateGuaranteedScenarioPage(snapshot, request("driver", "Oscar Piastri"))).toMatchObject({ status:"ERROR" });
    expect(calculateGuaranteedScenarioPage(snapshot, { ...request("driver", "Kimi Antonelli"), dataVersion:"old" })).toMatchObject({ status:"ERROR" });
    const first = calculateGuaranteedScenarioPage(snapshot, request("driver", "Kimi Antonelli"));
    if ("status" in first) throw new Error(first.reason);
    expect(calculateGuaranteedScenarioPage(snapshot, request("driver", "George Russell", first.nextCursor!))).toMatchObject({ status:"ERROR" });
  });
});

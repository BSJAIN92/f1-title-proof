import { describe, expect, it } from "vitest";
import classifiedRetirementFixture from "../../../data/frozen/2026-09-01/classified-retirement-fixture.json";
import {
  scoreAndValidateEvent,
  validateOfficialEvent,
  type EventEntrant,
  type EventResultInput,
  type OfficialEventResultInput,
} from "./event-outcome";

const entrants: EventEntrant[] = [
  { driverId: "driver-a", constructorId: "team-a" },
  { driverId: "driver-b", constructorId: "team-b" },
  { driverId: "driver-c", constructorId: "team-c" },
];

function result(
  driverId: string,
  position: number | null,
  status: EventResultInput["status"],
): EventResultInput {
  return { driverId, position, status };
}

describe("scoreAndValidateEvent", () => {
  it("applies the full-points race table", () => {
    const scored = scoreAndValidateEvent("race", entrants, [
      result("driver-a", 1, "FINISHED"),
      result("driver-b", 2, "FINISHED"),
      result("driver-c", 3, "FINISHED"),
    ]);

    expect(scored.map(({ awardedPoints }) => awardedPoints)).toEqual([25, 18, 15]);
  });

  it("applies the full-points Sprint table", () => {
    const scored = scoreAndValidateEvent("sprint", entrants, [
      result("driver-a", 1, "FINISHED"),
      result("driver-b", 2, "FINISHED"),
      result("driver-c", 3, "FINISHED"),
    ]);

    expect(scored.map(({ awardedPoints }) => awardedPoints)).toEqual([8, 7, 6]);
  });

  it("scores a classified retirement from its position", () => {
    const scored = scoreAndValidateEvent("race", entrants, [
      result("driver-a", 1, "FINISHED"),
      result("driver-b", 2, "FINISHED"),
      result("driver-c", 3, "DNF"),
    ]);

    expect(scored[2]).toMatchObject({ status: "DNF", position: 3, awardedPoints: 15 });
  });

  it("gives an unclassified retirement no points", () => {
    const scored = scoreAndValidateEvent("race", entrants, [
      result("driver-a", 1, "FINISHED"),
      result("driver-b", 2, "FINISHED"),
      result("driver-c", null, "DNF"),
    ]);

    expect(scored[2].awardedPoints).toBe(0);
  });

  it("models DNS explicitly with no classification or points", () => {
    const scored = scoreAndValidateEvent("race", entrants, [
      result("driver-a", 1, "FINISHED"),
      result("driver-b", null, "DNS"),
      result("driver-c", null, "DNS"),
    ]);

    expect(scored.slice(1)).toEqual([
      { driverId: "driver-b", constructorId: "team-b", position: null, status: "DNS", awardedPoints: 0 },
      { driverId: "driver-c", constructorId: "team-c", position: null, status: "DNS", awardedPoints: 0 },
    ]);
  });

  it("accepts official points for a classified DNF without inferring zero from its label", () => {
    const official: OfficialEventResultInput[] = [
      { ...result("driver-a", 1, "FINISHED"), awardedPoints: 25 },
      { ...result("driver-b", 2, "FINISHED"), awardedPoints: 18 },
      { ...result("driver-c", 3, "DNF"), awardedPoints: 15 },
    ];

    expect(validateOfficialEvent("race", entrants, official)[2]).toMatchObject({
      status: "DNF",
      position: 3,
      awardedPoints: 15,
    });
  });

  it("passes the approved classified-retirement fixture", () => {
    const fixtureEntrants: EventEntrant[] = Array.from({ length: 10 }, (_, index) => ({
      driverId: index === 9 ? classifiedRetirementFixture.result.driver : `fixture-driver-${index + 1}`,
      constructorId: index === 9 ? classifiedRetirementFixture.result.constructor : `fixture-team-${index + 1}`,
    }));
    const fixtureResults: OfficialEventResultInput[] = fixtureEntrants.map((entrant, index) => ({
      driverId: entrant.driverId,
      position: index + 1,
      status: index === 9 ? "DNF" : "FINISHED",
      awardedPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][index],
    }));

    expect(validateOfficialEvent("race", fixtureEntrants, fixtureResults)[9]).toMatchObject({
      driverId: classifiedRetirementFixture.result.driver,
      position: classifiedRetirementFixture.result.position,
      status: classifiedRetirementFixture.result.status,
      awardedPoints: classifiedRetirementFixture.result.awardedPoints,
    });
  });

  it("rejects official points that were inferred as zero only because the driver retired", () => {
    const official: OfficialEventResultInput[] = [
      { ...result("driver-a", 1, "FINISHED"), awardedPoints: 25 },
      { ...result("driver-b", 2, "FINISHED"), awardedPoints: 18 },
      { ...result("driver-c", 3, "DNF"), awardedPoints: 0 },
    ];

    expect(() => validateOfficialEvent("race", entrants, official)).toThrowError(
      expect.objectContaining({ code: "AWARDED_POINTS_MISMATCH" }),
    );
  });

  it.each([
    {
      label: "duplicate classified positions",
      results: [result("driver-a", 1, "FINISHED"), result("driver-b", 1, "FINISHED"), result("driver-c", 2, "FINISHED")],
      code: "DUPLICATE_POSITION",
    },
    {
      label: "a gap in classified positions",
      results: [result("driver-a", 1, "FINISHED"), result("driver-b", 3, "FINISHED"), result("driver-c", null, "DNF")],
      code: "NON_CONTIGUOUS_POSITIONS",
    },
    {
      label: "duplicate entrants",
      results: [result("driver-a", 1, "FINISHED"), result("driver-a", 2, "FINISHED"), result("driver-c", 3, "FINISHED")],
      code: "DUPLICATE_ENTRANT",
    },
    {
      label: "an unknown entrant",
      results: [result("driver-a", 1, "FINISHED"), result("driver-b", 2, "FINISHED"), result("driver-x", 3, "FINISHED")],
      code: "UNKNOWN_ENTRANT",
    },
    {
      label: "a missing entrant",
      results: [result("driver-a", 1, "FINISHED"), result("driver-b", 2, "FINISHED")],
      code: "MISSING_ENTRANT",
    },
    {
      label: "a finisher without a classification",
      results: [result("driver-a", 1, "FINISHED"), result("driver-b", 2, "FINISHED"), result("driver-c", null, "FINISHED")],
      code: "FINISHER_WITHOUT_POSITION",
    },
    {
      label: "a DNS entrant with a classification",
      results: [result("driver-a", 1, "FINISHED"), result("driver-b", 2, "FINISHED"), result("driver-c", 3, "DNS")],
      code: "DNS_WITH_POSITION",
    },
  ])("rejects $label", ({ results, code }) => {
    expect(() => scoreAndValidateEvent("race", entrants, results)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});

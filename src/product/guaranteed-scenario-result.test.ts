import { describe, expect, it } from "vitest";
import { parseGuaranteedScenarioPage } from "./guaranteed-scenario-result";

const valid = { kind:"driver", contenderId:"A", dataVersion:"v", ruleVersion:"r", currentPoints:10, strongestRivalId:"B", strongestRivalPoints:9, nextCursor:null, items:[{ key:"one", additionalPoints:25, finalPoints:35, races:[{key:"01",label:"P1",count:1,pointsEach:25}], sprint:{key:"00",label:"0 points",points:0} }] };

describe("guaranteed scenario response parser", () => {
  it("accepts the complete response shape", () => expect(parseGuaranteedScenarioPage(valid)).toEqual(valid));
  it.each([
    { ...valid, kind:"other" },
    { ...valid, currentPoints:-1 },
    { ...valid, items:[{ ...valid.items[0], races:[{ ...valid.items[0].races[0], count:0 }] }] },
    { ...valid, nextCursor:3 },
  ])("rejects malformed data", value => expect(parseGuaranteedScenarioPage(value)).toBeNull());
});

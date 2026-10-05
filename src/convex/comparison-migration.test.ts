import { describe, expect, it } from "vitest";
import { legacySelectionPatch } from "../../convex/comparisonMigration";

describe("legacy comparison ID migration", () => {
  it("moves a driver target into driverId", () => {
    expect(legacySelectionPatch({ kind: "driver", targetId: "Kimi Antonelli" })).toEqual({ driverId: "Kimi Antonelli", targetId: undefined });
  });

  it("moves a constructor target into constructorId", () => {
    expect(legacySelectionPatch({ kind: "constructor", targetId: "Mercedes-AMG PETRONAS F1 Team" })).toEqual({ constructorId: "Mercedes-AMG PETRONAS F1 Team", targetId: undefined });
  });

  it("skips rows without a legacy target", () => {
    expect(legacySelectionPatch({ kind: "driver", driverId: "Kimi Antonelli" })).toBeNull();
  });

  it("rejects a legacy row without a championship kind", () => {
    expect(() => legacySelectionPatch({ targetId: "Kimi Antonelli" })).toThrow("kind");
  });

  it("rejects a conflicting replacement value", () => {
    expect(() => legacySelectionPatch({ kind: "driver", targetId: "Kimi Antonelli", driverId: "George Russell" })).toThrow("conflicts");
  });
});

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../../data/frozen/2026-09-01/manifest.json";
import countback from "../../../data/frozen/2026-09-01/countback.json";
import sessionResults from "../../../data/frozen/2026-09-01/session-results.json";
import { verifyFrozenDriverSnapshot, type FrozenSnapshotInputs } from "./verified-frozen-driver-snapshot";

const clone = <T>(value: T): T => structuredClone(value);
function inputs(): FrozenSnapshotInputs {
  const base = resolve(process.cwd(), "data", "frozen", "2026-09-01");
  return { manifestBytes: readFileSync(resolve(base, "manifest.json")), artifactBytes: {
    "session-results.json": readFileSync(resolve(base, "session-results.json")), "countback.json": readFileSync(resolve(base, "countback.json")), "source-documents.json": readFileSync(resolve(base, "source-documents.json")),
  } };
}
function editManifest(input: FrozenSnapshotInputs, edit: (value: typeof manifest) => void): void {
  const value = JSON.parse(new TextDecoder().decode(input.manifestBytes)) as typeof manifest;
  edit(value);
  (input as { manifestBytes: Uint8Array }).manifestBytes = new TextEncoder().encode(JSON.stringify(value));
}
function replaceArtifact(input: FrozenSnapshotInputs, name: "session-results.json" | "countback.json" | "source-documents.json", value: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  (input.artifactBytes as Record<string, Uint8Array>)[name] = bytes;
  const key = name === "session-results.json" ? "sessionResults" : name === "countback.json" ? "countback" : "sourceDocuments";
  editManifest(input, (value) => { (value.artifacts as Record<string, { sha256: string }>)[key].sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase(); });
}
const expectInvalid = (input: FrozenSnapshotInputs) => expect(verifyFrozenDriverSnapshot(input)).toMatchObject({ status: "CALCULATION_FAILURE" });

describe("verified frozen driver snapshot", () => {
  it("verifies bytes and reconstructs all 22 baseline standings", () => {
    const result = verifyFrozenDriverSnapshot(inputs());
    expect(result.status).toBe("VERIFIED");
    if (result.status === "VERIFIED") expect(result.snapshot).toMatchObject({ fingerprint: expect.stringMatching(/^sha256-[0-9a-f]{64}$/), roster: { length: 22 }, sessions: { length: 12 }, standings: { length: 22 } });
  });

  it("rejects missing and duplicate standings drivers", () => {
    const missing = inputs(), duplicate = inputs();
    editManifest(missing, (value) => { value.driverStandings.splice(0, 1); });
    editManifest(duplicate, (value) => { value.driverStandings[1].driver = value.driverStandings[0].driver; });
    expectInvalid(missing); expectInvalid(duplicate);
  });

  it("rejects schedule count, type, and chronological order corruption", () => {
    const count = inputs(), type = inputs(), order = inputs();
    editManifest(count, (value) => { value.remainingSessions.pop(); });
    editManifest(type, (value) => { (value.remainingSessions[0] as { type: string }).type = "qualifying"; });
    editManifest(order, (value) => { [value.remainingSessions[0], value.remainingSessions[1]] = [value.remainingSessions[1], value.remainingSessions[0]]; });
    expectInvalid(count); expectInvalid(type); expectInvalid(order);
  });

  it("rejects scoring and countback corruption", () => {
    const scoring = inputs(), missing = inputs(), malformed = inputs();
    editManifest(scoring, (value) => { value.scoring.race[0] = 24; });
    const missingCountback = clone(countback), malformedCountback = clone(countback);
    delete (missingCountback.driver_race_finish_histograms as Record<string, unknown>)["Kimi Antonelli"];
    (malformedCountback.driver_qualifying_position_histograms as Record<string, Record<string, number>>)["Kimi Antonelli"] = { "0": -1 };
    replaceArtifact(missing, "countback.json", missingCountback); replaceArtifact(malformed, "countback.json", malformedCountback);
    expectInvalid(scoring); expectInvalid(missing); expectInvalid(malformed);
  });

  it("rejects changed completed results and mismatched artifact bytes", () => {
    const result = inputs(), bytes = inputs();
    const changed = clone(sessionResults); changed.events[0].rows[0].awarded_points += 1; replaceArtifact(result, "session-results.json", changed);
    bytes.artifactBytes["session-results.json"][0] ^= 1;
    expectInvalid(result);
    expect(verifyFrozenDriverSnapshot(bytes)).toMatchObject({ status: "CALCULATION_FAILURE", code: "ARTIFACT_CHECKSUM_MISMATCH" });
  });

  it("uses byte-parsed artifacts and rejects qualifying histogram or row corruption", () => {
    const histogram = inputs(), duplicate = inputs(), missing = inputs(), position = inputs();
    const h = clone(countback); h.driver_qualifying_position_histograms["Kimi Antonelli"]["1"] += 1; replaceArtifact(histogram, "countback.json", h);
    const d = clone(countback); d.qualifying_events[0].rows[1].driver = d.qualifying_events[0].rows[0].driver; replaceArtifact(duplicate, "countback.json", d);
    const m = clone(countback); m.qualifying_events[0].rows.pop(); replaceArtifact(missing, "countback.json", m);
    const p = clone(countback); p.qualifying_events[0].rows[1].position = p.qualifying_events[0].rows[0].position; replaceArtifact(position, "countback.json", p);
    expectInvalid(histogram); expectInvalid(duplicate); expectInvalid(missing); expectInvalid(position);
  });

  it("fails safely when verified artifact bytes are invalid JSON", () => {
    const input = inputs(), bytes = new TextEncoder().encode("{");
    (input.artifactBytes as Record<string, Uint8Array>)["countback.json"] = bytes;
    editManifest(input, (value) => { value.artifacts.countback.sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase(); });
    expectInvalid(input);
  });

  it("rejects constructor standings and future assignment corruption", () => {
    const missing = inputs(), duplicate = inputs(), assignment = inputs();
    editManifest(missing, (value) => { value.constructorStandings.pop(); });
    editManifest(duplicate, (value) => { value.constructorStandings[1].constructor = value.constructorStandings[0].constructor; });
    editManifest(assignment, (value) => { [value.futureLineup[0].drivers[0], value.futureLineup[1].drivers[0]] = [value.futureLineup[1].drivers[0], value.futureLineup[0].drivers[0]]; });
    expectInvalid(missing); expectInvalid(duplicate); expectInvalid(assignment);
  });

  it("rejects completed event-specific constructor and constructor countback corruption", () => {
    const completed = inputs(), race = inputs(), qualifying = inputs();
    const changedResults = clone(sessionResults); changedResults.events[0].rows[0].constructor = "Scuderia Ferrari HP"; replaceArtifact(completed, "session-results.json", changedResults);
    const changedRace = clone(countback); changedRace.constructor_race_finish_histograms["Mercedes-AMG PETRONAS F1 Team"]["1"] += 1; replaceArtifact(race, "countback.json", changedRace);
    const changedQualifying = clone(countback); changedQualifying.constructor_qualifying_position_histograms["Mercedes-AMG PETRONAS F1 Team"]["1"] += 1; replaceArtifact(qualifying, "countback.json", changedQualifying);
    expectInvalid(completed); expectInvalid(race); expectInvalid(qualifying);
  });

  it("rejects self-signed source-document tampering even when the manifest hash is updated", () => {
    const input = inputs();
    replaceArtifact(input, "source-documents.json", { tampered: true });
    expect(verifyFrozenDriverSnapshot(input)).toMatchObject({ status: "CALCULATION_FAILURE", code: "ARTIFACT_CHECKSUM_MISMATCH" });
  });
});

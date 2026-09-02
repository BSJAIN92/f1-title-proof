import { createHash } from "node:crypto";
import { APPROVED_FROZEN_DATA } from "./approved-frozen-constants";

export interface FrozenSnapshotInputs {
  readonly manifestBytes: Uint8Array;
  readonly artifactBytes: Readonly<Record<"session-results.json" | "countback.json" | "source-documents.json", Uint8Array>>;
}
export interface VerifiedFrozenDriverSnapshot {
  readonly dataVersion: string; readonly ruleVersion: string; readonly fingerprint: string;
  readonly cutoff: string;
  readonly unsupported: readonly string[];
  readonly roster: readonly { readonly driverId: string; readonly constructorId: string }[];
  readonly standings: readonly { readonly driverId: string; readonly position: number; readonly points: number; readonly racePositions: Readonly<Record<number, number>>; readonly qualifyingPositions: Readonly<Record<number, number>> }[];
  readonly sessions: readonly { readonly id: string; readonly session: "race" | "sprint"; readonly sequenceIndex: number }[];
  readonly constructorStandings: readonly { readonly constructorId: string; readonly position: number; readonly points: number; readonly racePositions: Readonly<Record<number, number>>; readonly qualifyingPositions: Readonly<Record<number, number>> }[];
}
export type SnapshotVerification = { readonly status: "VERIFIED"; readonly snapshot: VerifiedFrozenDriverSnapshot } | { readonly status: "CALCULATION_FAILURE"; readonly code: "INVALID_SNAPSHOT" | "ARTIFACT_CHECKSUM_MISMATCH"; readonly reason: string };

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex").toUpperCase();
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Obj).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
const fail = (reason: string, code: "INVALID_SNAPSHOT" | "ARTIFACT_CHECKSUM_MISMATCH" = "INVALID_SNAPSHOT"): SnapshotVerification => ({ status: "CALCULATION_FAILURE", code, reason });
const APPROVED_FUTURE_ASSIGNMENTS = [
  ["McLaren Mastercard F1 Team", "Lando Norris", "Oscar Piastri"], ["Mercedes-AMG PETRONAS F1 Team", "George Russell", "Kimi Antonelli"],
  ["Scuderia Ferrari HP", "Charles Leclerc", "Lewis Hamilton"], ["Oracle Red Bull Racing", "Max Verstappen", "Isack Hadjar"],
  ["Visa Cash App Racing Bulls F1 Team", "Liam Lawson", "Arvid Lindblad"], ["BWT Alpine F1 Team", "Pierre Gasly", "Franco Colapinto"],
  ["TGR Haas F1 Team", "Esteban Ocon", "Oliver Bearman"], ["Audi Revolut F1 Team", "Nico Hulkenberg", "Gabriel Bortoleto"],
  ["Atlassian Williams F1 Team", "Alexander Albon", "Carlos Sainz"], ["Aston Martin Aramco F1 Team", "Fernando Alonso", "Lance Stroll"],
  ["Cadillac Formula 1 Team", "Sergio Perez", "Valtteri Bottas"],
] as const;
function validHistogram(value: unknown): value is Record<string, number> {
  const candidate = obj(value);
  return !!candidate && Object.entries(candidate).every(([position, count]) => Number.isInteger(Number(position)) && Number(position) > 0 && Number.isInteger(count) && (count as number) >= 0);
}
function sameHistogram(left: Record<string, number>, right: Record<string, number>): boolean {
  const normalize = (value: Record<string, number>) => Object.fromEntries(Object.entries(value).filter(([, count]) => count > 0).sort(([a], [b]) => Number(a) - Number(b)));
  return canonical(normalize(left)) === canonical(normalize(right));
}

export function verifyFrozenDriverSnapshot(input: FrozenSnapshotInputs): SnapshotVerification {
  if (sha256(input.manifestBytes) !== APPROVED_FROZEN_DATA.manifestSha256) {
    return fail("The manifest bytes do not match the approved SHA-256.", "ARTIFACT_CHECKSUM_MISMATCH");
  }
  let manifest: Obj | null;
  try {
    manifest = obj(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.manifestBytes)));
  } catch { return fail("The frozen manifest cannot be decoded as valid JSON."); }
  if (!manifest) return fail("The frozen manifest has an invalid top-level shape.");
  if (manifest.dataVersion !== APPROVED_FROZEN_DATA.dataVersion || manifest.ruleVersion !== APPROVED_FROZEN_DATA.ruleVersion || obj(manifest.approval)?.status !== "approved" || obj(manifest.cutoff)?.local !== APPROVED_FROZEN_DATA.cutoff)
    return fail("Approval, version, or cutoff does not match the approved freeze.");
  const artifacts = obj(manifest.artifacts);
  if (!artifacts) return fail("Artifact declarations are missing.");
  for (const name of ["session-results.json", "countback.json", "source-documents.json"] as const) {
    const key = name === "session-results.json" ? "sessionResults" : name === "countback.json" ? "countback" : "sourceDocuments";
    const declaration = obj(artifacts[key]);
    const approvedSha256 = APPROVED_FROZEN_DATA.artifactSha256[name];
    if (!declaration || declaration.path !== name || declaration.sha256 !== approvedSha256 || sha256(input.artifactBytes[name]) !== approvedSha256)
      return fail(`The ${name} bytes do not match the approved SHA-256.`, "ARTIFACT_CHECKSUM_MISMATCH");
  }
  let countback: Obj | null, sessionResults: Obj | null, sourceDocuments: Obj | null;
  try {
    countback = obj(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.artifactBytes["countback.json"])));
    sessionResults = obj(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.artifactBytes["session-results.json"])));
    sourceDocuments = obj(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.artifactBytes["source-documents.json"])));
  } catch { return fail("A verified artifact cannot be decoded as valid JSON."); }
  if (!countback || !sessionResults || !sourceDocuments) return fail("A verified artifact has an invalid top-level shape.");
  const scoring = obj(manifest.scoring);
  if (!scoring || scoring.remainingSessionsAssumedFullPoints !== true || canonical(scoring.race) !== canonical([25,18,15,12,10,8,6,4,2,1]) || canonical(scoring.sprint) !== canonical([8,7,6,5,4,3,2,1])) return fail("The full-points scoring arrays are invalid.");
  const lineup = manifest.futureLineup;
  if (!Array.isArray(lineup) || lineup.length !== 11) return fail("The future lineup must contain exactly 11 teams.");
  const roster: { driverId: string; constructorId: string }[] = [];
  for (const entry of lineup) {
    const team = obj(entry);
    if (!team || typeof team.constructor !== "string" || !team.constructor || !Array.isArray(team.drivers) || team.drivers.length !== 2 || team.drivers.some((driver) => typeof driver !== "string" || !driver)) return fail("Every future team must have a name and exactly two non-empty drivers.");
    for (const driverId of team.drivers as string[]) roster.push({ driverId, constructorId: team.constructor });
  }
  if (canonical(lineup.map((entry) => { const team = obj(entry)!; return [team.constructor, ...(team.drivers as string[])]; })) !== canonical(APPROVED_FUTURE_ASSIGNMENTS)) return fail("Future driver-constructor assignments differ from the approved regular lineup.");
  if (new Set(roster.map(({ driverId }) => driverId)).size !== 22) return fail("The regular future lineup must contain 22 unique drivers.");
  const futureIds = new Set(roster.map(({ driverId }) => driverId));
  const constructorIds = new Set(roster.map(({ constructorId }) => constructorId));
  if (constructorIds.size !== 11) return fail("The future lineup must contain 11 unique constructors.");
  const declaredStandings = manifest.driverStandings;
  if (!Array.isArray(declaredStandings)) return fail("Driver standings are missing.");
  const pointMap = new Map<string, number>(), driverPositionMap = new Map<string, number>();
  for (const item of declaredStandings) {
    const standing = obj(item);
    if (!standing || typeof standing.driver !== "string" || !standing.driver || pointMap.has(standing.driver) || typeof standing.position !== "number" || !Number.isInteger(standing.position) || standing.position < 1 || typeof standing.points !== "number" || !Number.isFinite(standing.points) || standing.points < 0) return fail("Driver standings require unique non-empty IDs, positions, and finite non-negative points.");
    pointMap.set(standing.driver, standing.points);
    driverPositionMap.set(standing.driver, standing.position);
  }
  if ([...futureIds].some((id) => !pointMap.has(id))) return fail("Driver standings do not cover the exact regular future roster.");
  if (!Array.isArray(manifest.constructorStandings)) return fail("Constructor standings are missing.");
  const constructorPointMap = new Map<string, number>(), constructorPositionMap = new Map<string, number>();
  for (const item of manifest.constructorStandings) {
    const standing = obj(item);
    if (!standing || typeof standing.constructor !== "string" || !standing.constructor || constructorPointMap.has(standing.constructor) || typeof standing.position !== "number" || !Number.isInteger(standing.position) || standing.position < 1 || typeof standing.points !== "number" || !Number.isFinite(standing.points) || standing.points < 0) return fail("Constructor standings require unique non-empty IDs, positions, and finite non-negative points.");
    constructorPointMap.set(standing.constructor, standing.points);
    constructorPositionMap.set(standing.constructor, standing.position);
  }
  if (constructorPointMap.size !== 11 || [...constructorIds].some((id) => !constructorPointMap.has(id))) return fail("Constructor standings must exactly cover the 11 future teams.");
  const remaining = manifest.remainingSessions;
  if (!Array.isArray(remaining) || remaining.length !== 12) return fail("The revised remaining schedule must contain exactly 12 sessions.");
  const sessions: { id: string; session: "race" | "sprint"; sequenceIndex: number }[] = [];
  for (let index = 0; index < remaining.length; index += 1) {
    const item = obj(remaining[index]);
    if (!item || typeof item.date !== "string" || typeof item.event !== "string" || (item.type !== "race" && item.type !== "sprint")) return fail("A remaining session has invalid ordered metadata.");
    sessions.push({ id: `${item.date}:${item.event}:${item.type}`, session: item.type, sequenceIndex: index });
  }
  if (sessions.some((session, index) => index > 0 && session.id.slice(0, 10) < sessions[index - 1].id.slice(0, 10))) return fail("The revised remaining schedule is not in chronological order.");
  if (new Set(sessions.map(({ id }) => id)).size !== 12 || sessions.filter(({ session }) => session === "race").length !== 11 || sessions.filter(({ session }) => session === "sprint").length !== 1) return fail("The revised schedule must have unique IDs, 11 races, and one Sprint.");
  const raceHistograms = obj(countback.driver_race_finish_histograms), qualifyingHistograms = obj(countback.driver_qualifying_position_histograms);
  const constructorRaceHistograms = obj(countback.constructor_race_finish_histograms), constructorQualifyingHistograms = obj(countback.constructor_qualifying_position_histograms);
  if (!raceHistograms || !qualifyingHistograms || [...futureIds].some((id) => !validHistogram(raceHistograms[id]) || !validHistogram(qualifyingHistograms[id]))) return fail("Race and qualifying countback must contain well-formed coverage for every future driver.");
  if (!constructorRaceHistograms || !constructorQualifyingHistograms || [...constructorIds].some((id) => !validHistogram(constructorRaceHistograms[id]) || !validHistogram(constructorQualifyingHistograms[id]))) return fail("Constructor countback must contain well-formed coverage for every future team.");
  if (!Array.isArray(countback.qualifying_events) || countback.qualifying_events.length !== 12) return fail("Exactly 12 completed qualifying events are required.");
  if (!Array.isArray(sessionResults.events)) return fail("Completed session results are missing.");
  const expectedQualifyingIds = sessionResults.events.filter((value) => obj(value)?.session === "race").map((value) => obj(value)?.event);
  if (expectedQualifyingIds.length !== 12 || expectedQualifyingIds.some((id) => typeof id !== "string") || new Set(expectedQualifyingIds).size !== 12) return fail("Completed races do not define the expected 12 unique qualifying events.");
  const qualifyingEventIds = new Set<string>(), reconstructedQualifying = new Map<string, Record<string, number>>(), reconstructedConstructorQualifying = new Map<string, Record<string, number>>();
  for (const eventValue of countback.qualifying_events) {
    const event = obj(eventValue);
    if (!event || typeof event.event !== "string" || !event.event || qualifyingEventIds.has(event.event) || !Array.isArray(event.rows)) return fail("Qualifying events require unique IDs and result rows.");
    qualifyingEventIds.add(event.event);
    const drivers = new Set<string>(), positions = new Set<number>();
    for (const rowValue of event.rows) {
      const row = obj(rowValue);
      if (!row || typeof row.driver !== "string" || !row.driver || typeof row.constructor !== "string" || !row.constructor || drivers.has(row.driver) || (row.position !== null && (typeof row.position !== "number" || !Number.isInteger(row.position) || row.position < 1 || positions.has(row.position)))
        || (typeof row.classification !== "string" && typeof row.classification !== "number")) return fail(`Qualifying rows are malformed or duplicated for ${event.event}.`);
      drivers.add(row.driver);
      if (typeof row.position === "number") {
        positions.add(row.position);
        if (futureIds.has(row.driver)) { const histogram = reconstructedQualifying.get(row.driver) ?? {}; histogram[String(row.position)] = (histogram[String(row.position)] ?? 0) + 1; reconstructedQualifying.set(row.driver, histogram); }
        const teamHistogram = reconstructedConstructorQualifying.get(row.constructor) ?? {}; teamHistogram[String(row.position)] = (teamHistogram[String(row.position)] ?? 0) + 1; reconstructedConstructorQualifying.set(row.constructor, teamHistogram);
      }
    }
    if (drivers.size !== 22 || [...positions].some((position) => position > positions.size) || [...futureIds].filter((id) => drivers.has(id)).length < 21) return fail(`Qualifying participant coverage is invalid for ${event.event}.`);
  }
  if ([...qualifyingEventIds].sort().join("\u0000") !== [...expectedQualifyingIds as string[]].sort().join("\u0000")) return fail("Qualifying event IDs do not match the completed race snapshot.");
  for (const driverId of futureIds) if (!sameHistogram(reconstructedQualifying.get(driverId) ?? {}, qualifyingHistograms[driverId] as Record<string, number>)) return fail(`Reconstructed qualifying countback does not match for ${driverId}.`);
  for (const constructorId of constructorIds) if (!sameHistogram(reconstructedConstructorQualifying.get(constructorId) ?? {}, constructorQualifyingHistograms[constructorId] as Record<string, number>)) return fail(`Reconstructed constructor qualifying countback does not match for ${constructorId}.`);
  const reconstructedPoints = new Map<string, number>(), reconstructedRace = new Map<string, Record<string, number>>(), reconstructedConstructorPoints = new Map<string, number>(), reconstructedConstructorRace = new Map<string, Record<string, number>>();
  for (const eventValue of sessionResults.events) {
    const event = obj(eventValue);
    if (!event || (event.session !== "race" && event.session !== "sprint") || !Array.isArray(event.rows)) return fail("A completed session is malformed.");
    for (const rowValue of event.rows) {
      const row = obj(rowValue);
      if (!row || typeof row.driver !== "string" || typeof row.constructor !== "string" || !row.constructor || typeof row.awarded_points !== "number" || !Number.isFinite(row.awarded_points)) return fail("A completed result row is malformed.");
      reconstructedPoints.set(row.driver, (reconstructedPoints.get(row.driver) ?? 0) + row.awarded_points);
      reconstructedConstructorPoints.set(row.constructor, (reconstructedConstructorPoints.get(row.constructor) ?? 0) + row.awarded_points);
      if (event.session === "race" && typeof row.position === "number" && Number.isInteger(row.position) && row.position > 0) {
        const histogram = reconstructedRace.get(row.driver) ?? {}; histogram[String(row.position)] = (histogram[String(row.position)] ?? 0) + 1; reconstructedRace.set(row.driver, histogram);
        const teamHistogram = reconstructedConstructorRace.get(row.constructor) ?? {}; teamHistogram[String(row.position)] = (teamHistogram[String(row.position)] ?? 0) + 1; reconstructedConstructorRace.set(row.constructor, teamHistogram);
      }
    }
  }
  for (const constructorId of constructorIds) {
    if ((reconstructedConstructorPoints.get(constructorId) ?? 0) !== constructorPointMap.get(constructorId)) return fail(`Reconstructed constructor points do not match for ${constructorId}.`);
    if (!sameHistogram(reconstructedConstructorRace.get(constructorId) ?? {}, constructorRaceHistograms[constructorId] as Record<string, number>)) return fail(`Reconstructed constructor race countback does not match for ${constructorId}.`);
  }
  for (const driverId of futureIds) {
    if ((reconstructedPoints.get(driverId) ?? 0) !== pointMap.get(driverId)) return fail(`Reconstructed points do not match the manifest for ${driverId}.`);
    if (!sameHistogram(reconstructedRace.get(driverId) ?? {}, raceHistograms[driverId] as Record<string, number>)) return fail(`Reconstructed race countback does not match for ${driverId}.`);
  }
  const excluded = obj(manifest.excluded);
  if (!excluded || !Array.isArray(excluded.permanent) || !Array.isArray(excluded.v1) || [...excluded.permanent, ...excluded.v1].some((item) => typeof item !== "string")) return fail("Unsupported-case declarations are malformed.");
  const mathematicallyRelevant = { dataVersion: manifest.dataVersion, ruleVersion: manifest.ruleVersion, roster, sessions, scoring: { race: scoring.race, sprint: scoring.sprint }, standings: [...futureIds].sort().map((id) => ({ id, points: pointMap.get(id), race: raceHistograms[id], qualifying: qualifyingHistograms[id] })), constructorStandings: [...constructorIds].sort().map((id) => ({ id, points: constructorPointMap.get(id), race: constructorRaceHistograms[id], qualifying: constructorQualifyingHistograms[id] })) };
  const fingerprint = `sha256-${sha256(canonical(mathematicallyRelevant)).toLowerCase()}`;
  if (fingerprint !== APPROVED_FROZEN_DATA.snapshotFingerprint) return fail("The computed snapshot fingerprint does not match the approved fingerprint.");
  return { status: "VERIFIED", snapshot: deepFreeze({ dataVersion: manifest.dataVersion as string, ruleVersion: manifest.ruleVersion as string, cutoff: obj(manifest.cutoff)!.local as string, fingerprint, unsupported: [...excluded.permanent as string[], ...excluded.v1 as string[]], roster, sessions, standings: roster.map(({ driverId }) => ({ driverId, position: driverPositionMap.get(driverId)!, points: pointMap.get(driverId)!, racePositions: { ...(raceHistograms[driverId] as Record<number, number>) }, qualifyingPositions: { ...(qualifyingHistograms[driverId] as Record<number, number>) } })).sort((a, b) => a.position - b.position), constructorStandings: [...constructorIds].map((constructorId) => ({ constructorId, position: constructorPositionMap.get(constructorId)!, points: constructorPointMap.get(constructorId)!, racePositions: { ...(constructorRaceHistograms[constructorId] as Record<number, number>) }, qualifyingPositions: { ...(constructorQualifyingHistograms[constructorId] as Record<number, number>) } })).sort((a, b) => a.position - b.position) }) };
}

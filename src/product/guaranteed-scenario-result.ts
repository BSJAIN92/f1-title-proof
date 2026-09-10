import type { FinishSummary, GuaranteedScenario, GuaranteedScenarioPage } from "./guaranteed-scenarios";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function parseGuaranteedScenarioPage(value: unknown): GuaranteedScenarioPage | null {
  if (!record(value) || (value.kind !== "driver" && value.kind !== "constructor") || typeof value.contenderId !== "string" || typeof value.dataVersion !== "string" || typeof value.ruleVersion !== "string" || !integer(value.currentPoints) || typeof value.strongestRivalId !== "string" || !integer(value.strongestRivalPoints) || !Array.isArray(value.items) || (value.nextCursor !== null && typeof value.nextCursor !== "string")) return null;
  const items: GuaranteedScenario[] = [];
  for (const candidate of value.items) {
    if (!record(candidate) || typeof candidate.key !== "string" || !integer(candidate.additionalPoints) || !integer(candidate.finalPoints) || !Array.isArray(candidate.races) || !record(candidate.sprint) || typeof candidate.sprint.key !== "string" || typeof candidate.sprint.label !== "string" || !integer(candidate.sprint.points)) return null;
    const races: FinishSummary[] = [];
    for (const group of candidate.races) {
      if (!record(group) || typeof group.key !== "string" || typeof group.label !== "string" || !integer(group.count) || group.count === 0 || !integer(group.pointsEach)) return null;
      races.push({ key:group.key, label:group.label, count:group.count, pointsEach:group.pointsEach });
    }
    items.push({ key:candidate.key, additionalPoints:candidate.additionalPoints, finalPoints:candidate.finalPoints, races, sprint:{ key:candidate.sprint.key, label:candidate.sprint.label, points:candidate.sprint.points } });
  }
  return { kind:value.kind, contenderId:value.contenderId, dataVersion:value.dataVersion, ruleVersion:value.ruleVersion, currentPoints:value.currentPoints, strongestRivalId:value.strongestRivalId, strongestRivalPoints:value.strongestRivalPoints, items, nextCursor:value.nextCursor };
}

export type LegacySelectionRow = {
  kind?: "driver" | "constructor";
  targetId?: string;
  driverId?: string;
  constructorId?: string;
};

export type LegacySelectionPatch =
  | { driverId: string; targetId: undefined }
  | { constructorId: string; targetId: undefined };

export function legacySelectionPatch(row: LegacySelectionRow): LegacySelectionPatch | null {
  if (row.targetId === undefined) return null;
  if (!row.targetId) throw new Error("The legacy comparison target is empty.");
  if (row.kind !== "driver" && row.kind !== "constructor") throw new Error("The legacy comparison kind is missing.");
  const replacement = row.kind === "driver" ? row.driverId : row.constructorId;
  if (replacement !== undefined && replacement !== row.targetId) throw new Error("The legacy comparison target conflicts with its replacement field.");
  return row.kind === "driver"
    ? { driverId: row.targetId, targetId: undefined }
    : { constructorId: row.targetId, targetId: undefined };
}

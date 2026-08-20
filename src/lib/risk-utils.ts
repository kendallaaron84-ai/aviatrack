import { createHash } from "node:crypto";

export const CLOSED_RAID_STATUSES = new Set(["resolved", "resolved - complete", "closed", "merged", "archived"]);

export function normalizeRiskText(value: unknown): string {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function riskSimilarity(left: unknown, right: unknown): number {
  const a = new Set(normalizeRiskText(left).split(" ").filter(word => word.length > 2));
  const b = new Set(normalizeRiskText(right).split(" ").filter(word => word.length > 2));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(word => b.has(word)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function deterministicRaidId(sourceKey: string): string {
  return `SRC_${createHash("sha256").update(sourceKey).digest("hex").slice(0, 32)}`;
}

export function fieldObservationSourceKey(parentId: string, childId: string, reportNumber?: string, itemNumber?: string): string {
  if (reportNumber && itemNumber) return itemNumber.startsWith("FOR-") ? itemNumber : `${reportNumber}-${itemNumber.split("-").pop()}`;
  return `FIELD_${parentId}_${childId}`;
}

export function journalSourceKey(projectId: string, journalId: string): string {
  return `JOURNAL_${projectId}_${journalId}`;
}

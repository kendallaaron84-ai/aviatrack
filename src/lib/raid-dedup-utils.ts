import { CLOSED_RAID_STATUSES, normalizeRiskText, riskSimilarity } from "./risk-utils";

export type RaidDedupCandidate = { id: string; data: Record<string, any> };
export type RaidDedupMatch = {
  canonical: RaidDedupCandidate;
  duplicate: RaidDedupCandidate;
  reason: string;
  confidence: number;
};

export function chooseRaidDuplicateMatches(items: RaidDedupCandidate[]) {
  const matches: RaidDedupMatch[] = [];
  const ambiguous: Array<{ leftId: string; rightId: string; projectId: string; similarity: number }> = [];
  const claimed = new Set<string>();
  const byProject = new Map<string, RaidDedupCandidate[]>();

  for (const item of items) {
    const projectId = String(item.data.projectId || "Unassigned");
    if (item.data.mergeStatus === "MERGED" || CLOSED_RAID_STATUSES.has(normalizeRiskText(item.data.status))) continue;
    byProject.set(projectId, [...(byProject.get(projectId) || []), item]);
  }

  for (const [projectId, projectItems] of byProject) {
    for (let i = 0; i < projectItems.length; i++) {
      for (let j = i + 1; j < projectItems.length; j++) {
        const left = projectItems[i], right = projectItems[j];
        if (claimed.has(left.id) || claimed.has(right.id)) continue;
        const leftText = `${left.data.title || ""} ${left.data.description || ""}`;
        const rightText = `${right.data.title || ""} ${right.data.description || ""}`;
        const exact = normalizeRiskText(leftText) === normalizeRiskText(rightText);
        const similarity = riskSimilarity(leftText, rightText);
        if (exact || similarity >= 0.95) {
          const ordered = [left, right].sort((a, b) => String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || "")) || a.id.localeCompare(b.id));
          matches.push({ canonical: ordered[0], duplicate: ordered[1], reason: exact ? "normalized title and description match" : "high-confidence token similarity", confidence: exact ? 1 : similarity });
          claimed.add(ordered[1].id);
        } else if (similarity >= 0.7) {
          ambiguous.push({ leftId: left.id, rightId: right.id, projectId, similarity });
        }
      }
    }
  }

  return { matches, ambiguous };
}

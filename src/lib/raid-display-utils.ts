export const RAID_OWNERSHIP_STATES = [
  "New / Unassigned",
  "Owned",
  "Mitigated",
  "Accepted",
  "Resolved",
] as const;

export type RaidOwnershipState = typeof RAID_OWNERSHIP_STATES[number];

export const RAID_OWNERSHIP_COLORS: Record<RaidOwnershipState, string> = {
  "New / Unassigned": "#EF4444",
  Owned: "#1A2D83",
  Mitigated: "#883AE1",
  Accepted: "#3B82F6",
  Resolved: "#10B981",
};

const ownershipStateByKey = new Map(
  RAID_OWNERSHIP_STATES.map(state => [state.toLowerCase(), state]),
);

const unassignedOwners = new Set(["", "unassigned", "none", "n/a", "na", "unknown"]);

export function normalizeRaidProbability(value: unknown): number {
  if (value === null || value === undefined || value === "") return 2;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(4, Math.round(parsed)));
}

export function resolveRaidOwnershipState(item: Record<string, unknown>): RaidOwnershipState {
  for (const candidate of [item.roamCategory, item.status]) {
    const normalized = String(candidate || "").trim().toLowerCase();
    const state = ownershipStateByKey.get(normalized);
    if (state) return state;
  }

  const status = String(item.status || "").trim().toLowerCase();
  if (status === "closed" || status.startsWith("resolved")) return "Resolved";

  const owner = String(item.assignedOwner || item.owner || "").trim().toLowerCase();
  return unassignedOwners.has(owner) ? "New / Unassigned" : "Owned";
}

export function createProjectNameMap(
  projects: Array<{ id?: string; projectId?: string; name?: string; projectName?: string }>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const project of projects) {
    const projectId = String(project.projectId || project.id || "").trim();
    const name = String(project.name || project.projectName || "").trim();
    if (projectId && name) names.set(projectId, name);
  }
  return names;
}

export function resolveProjectName(
  projectId: unknown,
  projectNames: ReadonlyMap<string, string>,
  legacyProjectName?: unknown,
): string {
  const id = String(projectId || "").trim();
  return (id && projectNames.get(id)) || String(legacyProjectName || "").trim() || id || "Unassigned Project";
}

export function formatRaidNumber(sequence: number): string {
  return `RAID-${sequence}`;
}

export function raidCreatedAtMillis(value: unknown): number {
  if (value && typeof value === "object") {
    const timestamp = value as { seconds?: unknown; toDate?: () => Date };
    if (typeof timestamp.toDate === "function") {
      const millis = timestamp.toDate().getTime();
      return Number.isFinite(millis) ? millis : Number.POSITIVE_INFINITY;
    }
    if (Number.isFinite(Number(timestamp.seconds))) return Number(timestamp.seconds) * 1000;
  }
  const millis = new Date(String(value || "")).getTime();
  return Number.isFinite(millis) ? millis : Number.POSITIVE_INFINITY;
}

export function buildRaidNumberingMapping(
  documents: Array<{ id: string; data: { createdAt?: unknown; mergeStatus?: unknown } }>,
  firstSequence = 1001,
) {
  return documents
    .filter(document => document.data.mergeStatus !== "MERGED")
    .sort((left, right) => raidCreatedAtMillis(left.data.createdAt) - raidCreatedAtMillis(right.data.createdAt) || left.id.localeCompare(right.id))
    .map((document, index) => ({
      firestoreDocumentId: document.id,
      raidSequence: firstSequence + index,
      raidNumber: formatRaidNumber(firstSequence + index),
    }));
}

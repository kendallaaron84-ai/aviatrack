import { normalizeRiskText, riskSimilarity } from "./risk-utils";

export const NEW_RAID_CONFIDENCE_THRESHOLD = 0.85;
export const RAID_RELATIONSHIP_THRESHOLD = 0.85;

export type RaidIngestionAction = "NO_RAID" | "MERGE_EVIDENCE" | "NEW_RAID";
export type RaidDeleteDisposition = "PM_REJECTED" | "DUPLICATE" | "CREATED_IN_ERROR";

export type RaidAnalysis = {
  title: string;
  description: string;
  classification: "Risk" | "Assumption" | "Issue" | "Dependency";
  importance: "Critical" | "Mandatory" | "High" | "Medium" | "Low";
  probability: 1 | 2 | 3 | 4;
};

export type RaidCandidate = {
  id: string;
  projectId: string;
  title?: string;
  description?: string;
  sourceKey?: string;
  sourceKeys?: string[];
};

export type RaidSuppression = {
  id?: string;
  projectId: string;
  sourceKey?: string;
  sourceKeys?: string[];
  normalizedTitle?: string;
  normalizedRiskFingerprint?: string;
  disposition?: RaidDeleteDisposition;
};

export type RaidProposal = {
  action: RaidIngestionAction;
  existingRaidId?: string;
  confidence: number;
  rationale: string;
  analysis?: RaidAnalysis;
};

export type RaidProposalGate =
  | { outcome: "SUPPRESSED"; suppressionId?: string; reason: string }
  | { outcome: "NO_RAID"; reason: string }
  | { outcome: "MERGE_EVIDENCE"; candidateId: string; reason: string }
  | { outcome: "NEW_RAID"; analysis: RaidAnalysis; reason: string };

export function collectRaidSourceKeys(record: Record<string, any>): string[] {
  const keys = [
    record.sourceKey,
    ...(Array.isArray(record.sourceKeys) ? record.sourceKeys : []),
    ...(Array.isArray(record.sourceReferences) ? record.sourceReferences.map((reference: any) => reference?.sourceKey) : []),
  ];
  return [...new Set(keys.filter((key): key is string => typeof key === "string" && key.trim().length > 0))];
}

export function buildRaidSuppression(record: Record<string, any>, context: {
  documentId: string;
  disposition: RaidDeleteDisposition;
  reviewedBy: string;
  reviewedAt: string;
  reason?: string;
  canonicalRaidId?: string;
  canonicalRaidNumber?: string;
}) {
  const sourceKeys = collectRaidSourceKeys(record);
  return {
    ...(sourceKeys[0] ? { sourceKey: sourceKeys[0] } : {}),
    sourceKeys,
    projectId: String(record.projectId || "Unassigned"),
    normalizedTitle: normalizeRiskText(record.title),
    normalizedRiskFingerprint: normalizedRiskFingerprint(record),
    disposition: context.disposition,
    ...(context.canonicalRaidId ? { canonicalRaidId: context.canonicalRaidId } : {}),
    ...(context.canonicalRaidNumber ? { canonicalRaidNumber: context.canonicalRaidNumber } : {}),
    deletedRaidNumber: String(record.raidNumber || context.documentId),
    deletedRaidDocumentId: context.documentId,
    reviewedBy: context.reviewedBy,
    reviewedAt: context.reviewedAt,
    ...(context.reason?.trim() ? { reason: context.reason.trim() } : {}),
  };
}

export function normalizedRiskFingerprint(value: { title?: unknown; description?: unknown }): string {
  return normalizeRiskText(`${value.title || ""} ${value.description || ""}`);
}

export function suppressionMatchesSource(sourceKey: string, suppression: RaidSuppression): boolean {
  return suppression.sourceKey === sourceKey || (suppression.sourceKeys || []).includes(sourceKey);
}

export function suppressionMatchesRisk(projectId: string, analysis: RaidAnalysis, suppression: RaidSuppression): boolean {
  if (suppression.projectId !== projectId) return false;
  const fingerprint = normalizedRiskFingerprint(analysis);
  const suppressedFingerprint = normalizeRiskText(suppression.normalizedRiskFingerprint);
  const title = normalizeRiskText(analysis.title);
  const suppressedTitle = normalizeRiskText(suppression.normalizedTitle);
  if (!fingerprint || (!suppressedFingerprint && !suppressedTitle)) return false;
  if (suppressedFingerprint && fingerprint === suppressedFingerprint) return true;
  if (suppressedTitle && title === suppressedTitle) return true;
  return suppressedFingerprint ? riskSimilarity(fingerprint, suppressedFingerprint) >= RAID_RELATIONSHIP_THRESHOLD : false;
}

export function findDeterministicRaidMatch(projectId: string, analysis: RaidAnalysis, candidates: RaidCandidate[]): RaidCandidate | undefined {
  const fingerprint = normalizedRiskFingerprint(analysis);
  const normalizedTitle = normalizeRiskText(analysis.title);
  return candidates.find(candidate => {
    if (candidate.projectId !== projectId) return false;
    const candidateFingerprint = normalizedRiskFingerprint(candidate);
    return normalizeRiskText(candidate.title) === normalizedTitle ||
      candidateFingerprint === fingerprint ||
      riskSimilarity(candidateFingerprint, fingerprint) >= RAID_RELATIONSHIP_THRESHOLD;
  });
}

export function hasSufficientRaidEvidence(sourceText: string, analysis: RaidAnalysis | undefined, confidence: number): boolean {
  if (!analysis || confidence < NEW_RAID_CONFIDENCE_THRESHOLD) return false;
  const sourceWords = normalizeRiskText(sourceText).split(" ").filter(Boolean);
  const titleWords = normalizeRiskText(analysis.title).split(" ").filter(Boolean);
  const descriptionWords = normalizeRiskText(analysis.description).split(" ").filter(Boolean);
  if (sourceWords.length < 6 || titleWords.length < 2 || descriptionWords.length < 8) return false;
  const vagueSource = /^(fyi|note|update|work continues|no change|for information|coordination ongoing)\b/i.test(sourceText.trim());
  return !vagueSource;
}

export function gateRaidProposal(input: {
  sourceKey: string;
  sourceText: string;
  projectId: string;
  proposal: RaidProposal;
  candidates: RaidCandidate[];
  suppressions: RaidSuppression[];
}): RaidProposalGate {
  const exactSuppression = input.suppressions.find(suppression =>
    suppression.projectId === input.projectId && suppressionMatchesSource(input.sourceKey, suppression),
  );
  if (exactSuppression) return { outcome: "SUPPRESSED", suppressionId: exactSuppression.id, reason: "Authoritative source was previously rejected by the Program Manager." };

  const exactCanonicalSource = input.candidates.find(candidate =>
    candidate.projectId === input.projectId && (candidate.sourceKey === input.sourceKey || (candidate.sourceKeys || []).includes(input.sourceKey)),
  );
  if (exactCanonicalSource) return { outcome: "MERGE_EVIDENCE", candidateId: exactCanonicalSource.id, reason: "Authoritative source key already belongs to an active same-project canonical RAID record." };

  if (input.proposal.action === "NO_RAID") return { outcome: "NO_RAID", reason: input.proposal.rationale || "The source does not justify an actionable RAID condition." };
  const analysis = input.proposal.analysis;
  if (!analysis) return { outcome: "NO_RAID", reason: "Gemini did not provide a complete, schema-valid risk analysis." };

  const relatedSuppression = input.suppressions.find(suppression => suppressionMatchesRisk(input.projectId, analysis, suppression));
  if (relatedSuppression) return { outcome: "SUPPRESSED", suppressionId: relatedSuppression.id, reason: "The proposed condition matches a same-project PM suppression." };

  const deterministicMatch = findDeterministicRaidMatch(input.projectId, analysis, input.candidates);
  if (deterministicMatch) return { outcome: "MERGE_EVIDENCE", candidateId: deterministicMatch.id, reason: "Deterministic same-project comparison matched an existing canonical RAID record." };

  if (input.proposal.action === "MERGE_EVIDENCE") {
    const requestedTarget = input.candidates.find(candidate => candidate.projectId === input.projectId && candidate.id === input.proposal.existingRaidId);
    if (requestedTarget && input.proposal.confidence >= RAID_RELATIONSHIP_THRESHOLD) {
      return { outcome: "MERGE_EVIDENCE", candidateId: requestedTarget.id, reason: input.proposal.rationale };
    }
    return { outcome: "NO_RAID", reason: "The proposed evidence merge did not identify a sufficiently confident same-project canonical record." };
  }

  if (!hasSufficientRaidEvidence(input.sourceText, analysis, input.proposal.confidence)) {
    return { outcome: "NO_RAID", reason: "The source does not meet the conservative evidence and confidence threshold for a new RAID record." };
  }
  return { outcome: "NEW_RAID", analysis, reason: input.proposal.rationale };
}

export async function suppressThenDeleteRaid(operations: {
  persistSuppression: () => Promise<void>;
  suppressionExists: () => Promise<boolean>;
  deleteRaid: () => Promise<void>;
  raidExists: () => Promise<boolean>;
}): Promise<void> {
  await operations.persistSuppression();
  if (!await operations.suppressionExists()) throw new Error("Suppression verification failed; RAID record retained.");
  await operations.deleteRaid();
  if (await operations.raidExists()) throw new Error("RAID deletion verification failed.");
}


export type EvidenceVerificationStatus = "STAGED" | "UPLOADING" | "VERIFYING" | "VERIFIED" | "FAILED";

export interface EvidenceManifestEntry {
  evidenceId: string;
  storagePath: string;
  downloadUrl: string;
  originalFileName: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  contentType: string;
  verificationStatus: "VERIFIED";
  verifiedAt: string;
  originalSha256: string;
  storageMd5Hash: string;
  uploadAttempts: number;
}

export interface StagedEvidenceRecord {
  id: string;
  draftId: string;
  observationId: string;
  originalFileName: string;
  originalSizeBytes: number;
  contentType: string;
  lastModified: number;
  blob: Blob;
  status: EvidenceVerificationStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  manifest?: EvidenceManifestEntry;
}

export function isNonEmptyEvidence(file: Pick<Blob, "size">): boolean {
  return Number.isFinite(file.size) && file.size > 0;
}

export function evidenceStoragePath(
  parentId: string,
  observationId: string,
  evidenceId: string,
  originalFileName: string,
  attempt: number,
): string {
  const rawExtension = originalFileName.split(".").pop()?.toLowerCase() || "jpg";
  const extension = rawExtension.replace(/[^a-z0-9]/g, "") || "jpg";
  const suffix = attempt > 1 ? `-retry-${attempt}` : "";
  return `field_evidence/${parentId}-${observationId}-${evidenceId}${suffix}.${extension}`;
}

export function storagePathFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = "/o/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function evidenceSummary(statuses: EvidenceVerificationStatus[]) {
  const total = statuses.length;
  const verified = statuses.filter(status => status === "VERIFIED").length;
  const failed = statuses.filter(status => status === "FAILED").length;
  return { total, verified, failed, complete: total === verified };
}


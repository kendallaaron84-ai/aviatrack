import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { storagePathFromDownloadUrl } from "@/lib/evidence-integrity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type EvidenceReference = {
  parentObservationId: string;
  subObservationId: string;
  itemNumber: string;
  source: "manifest" | "legacy-itemPhotos";
  originalFileName?: string;
  originalSizeBytes?: number;
  storedSizeBytes?: number;
  verificationStatus?: string;
  verifiedAt?: string;
};

function bearerToken(request: NextRequest): string {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function pathFromEvidenceUrl(value: string): string | null {
  if (value.startsWith("gs://")) {
    const withoutScheme = value.slice(5);
    const slashIndex = withoutScheme.indexOf("/");
    return slashIndex >= 0 ? withoutScheme.slice(slashIndex + 1) : null;
  }
  return storagePathFromDownloadUrl(value);
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const admin = getFirebaseAdmin();
    const token = bearerToken(request);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    await admin.auth.verifyIdToken(token);

    const referenceMap = new Map<string, EvidenceReference[]>();
    const unresolvedReferences: Array<EvidenceReference & { reason: string }> = [];
    const addReference = (path: string, reference: EvidenceReference) => {
      referenceMap.set(path, [...(referenceMap.get(path) || []), reference]);
    };

    const subObservations = await admin.db.collectionGroup("sub_observations").get();
    for (const snapshot of subObservations.docs) {
      const data = snapshot.data();
      const parentObservationId = snapshot.ref.parent.parent?.id || data.parentObservationId || "unknown";
      const baseReference = {
        parentObservationId,
        subObservationId: snapshot.id,
        itemNumber: data.itemNumber || "Unnumbered",
      };
      const manifestUrls = new Set<string>();

      if (Array.isArray(data.evidenceManifest)) {
        for (const entry of data.evidenceManifest) {
          const path = typeof entry?.storagePath === "string" && entry.storagePath.trim()
            ? entry.storagePath.trim()
            : typeof entry?.downloadUrl === "string"
              ? pathFromEvidenceUrl(entry.downloadUrl)
              : null;
          if (typeof entry?.downloadUrl === "string") manifestUrls.add(entry.downloadUrl);
          const reference: EvidenceReference = {
            ...baseReference,
            source: "manifest",
            originalFileName: entry?.originalFileName,
            originalSizeBytes: toNumber(entry?.originalSizeBytes),
            storedSizeBytes: toNumber(entry?.storedSizeBytes),
            verificationStatus: entry?.verificationStatus,
            verifiedAt: entry?.verifiedAt,
          };
          if (path) addReference(path, reference);
          else unresolvedReferences.push({ ...reference, reason: "Manifest has no resolvable Storage path." });
        }
      }

      if (Array.isArray(data.itemPhotos)) {
        for (const value of data.itemPhotos) {
          if (typeof value !== "string" || !value.trim() || manifestUrls.has(value)) continue;
          const path = pathFromEvidenceUrl(value);
          const reference: EvidenceReference = { ...baseReference, source: "legacy-itemPhotos" };
          if (path) addReference(path, reference);
          else unresolvedReferences.push({ ...reference, reason: "Legacy evidence URL does not resolve to Firebase Storage." });
        }
      }
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : "");
    if (!bucketName) throw new Error("Firebase Storage bucket is not configured.");
    const bucket = getStorage(admin.app).bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: "field_evidence/" });
    const objects = await Promise.all(files.map(async file => {
      const [metadata] = await file.getMetadata();
      return {
        storagePath: file.name,
        sizeBytes: Number(metadata.size || 0),
        contentType: metadata.contentType || "application/octet-stream",
        createdAt: metadata.timeCreated || null,
        updatedAt: metadata.updated || null,
      };
    }));
    const objectsByPath = new Map(objects.map(object => [object.storagePath, object]));

    const zeroByte = objects
      .filter(object => object.sizeBytes === 0)
      .map(object => ({ ...object, references: referenceMap.get(object.storagePath) || [] }));
    const missing = [
      ...[...referenceMap.entries()]
        .filter(([path]) => !objectsByPath.has(path))
        .map(([storagePath, references]) => ({ storagePath, references, reason: "Referenced Storage object does not exist." })),
      ...unresolvedReferences.map(reference => ({ storagePath: null, references: [reference], reason: reference.reason })),
    ];
    const orphaned = objects
      .filter(object => !referenceMap.has(object.storagePath))
      .map(object => ({ ...object, references: [] as EvidenceReference[] }));
    const verified = objects
      .filter(object => object.sizeBytes > 0)
      .map(object => ({ ...object, references: referenceMap.get(object.storagePath) || [] }))
      .filter(object => object.references.some(reference =>
        reference.source === "manifest" &&
        reference.verificationStatus === "VERIFIED" &&
        reference.originalSizeBytes === object.sizeBytes &&
        reference.storedSizeBytes === object.sizeBytes
      ));
    const unverified = objects
      .filter(object => object.sizeBytes > 0 && referenceMap.has(object.storagePath))
      .map(object => ({ ...object, references: referenceMap.get(object.storagePath) || [] }))
      .filter(object => !verified.some(verifiedObject => verifiedObject.storagePath === object.storagePath));

    return NextResponse.json({
      readOnly: true,
      generatedAt: new Date().toISOString(),
      bucket: bucketName,
      summary: {
        totalObjects: objects.length,
        referencedObjects: objects.filter(object => referenceMap.has(object.storagePath)).length,
        zeroByte: zeroByte.length,
        missing: missing.length,
        orphaned: orphaned.length,
        verified: verified.length,
        unverified: unverified.length,
      },
      zeroByte,
      missing,
      orphaned,
      verified,
      unverified,
    });
  } catch (error: any) {
    console.error("Evidence integrity audit failed:", error);
    const status = error?.code?.startsWith?.("auth/") ? 401 : 500;
    return NextResponse.json({ error: error.message || "Evidence integrity audit failed." }, { status });
  }
}

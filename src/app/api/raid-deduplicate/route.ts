export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { chooseRaidDuplicateMatches } from "@/lib/raid-dedup-utils";

const requestSchema = z.object({ mode: z.enum(["dry-run", "apply"]).default("dry-run") }).strict();

const unionObjects = (left: unknown, right: unknown) => {
  const entries = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
  return [...new Map(entries.map((entry: any) => [JSON.stringify(entry), entry])).values()];
};

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const admin = getFirebaseAdmin();
    await admin.auth.verifyIdToken(token);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });
    const snapshot = await admin.db.collection("raid_matrix").get();
    const { matches, ambiguous } = chooseRaidDuplicateMatches(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })));
    const report = matches.map(match => ({ canonicalId: match.canonical.id, duplicateIds: [match.duplicate.id], projectId: match.canonical.data.projectId || "Unassigned", reason: match.reason, confidence: match.confidence, proposedAction: "preserve canonical PM fields, merge evidence/history, mark duplicate MERGED" }));
    if (parsed.data.mode === "dry-run") return NextResponse.json({ mode: "dry-run", candidateGroupCount: report.length, candidates: report, ambiguous });

    let consolidatedCount = 0;
    for (const match of matches) {
      await admin.db.runTransaction(async transaction => {
        const canonicalRef = admin.db.collection("raid_matrix").doc(match.canonical.id);
        const duplicateRef = admin.db.collection("raid_matrix").doc(match.duplicate.id);
        const [canonicalSnap, duplicateSnap] = await Promise.all([transaction.get(canonicalRef), transaction.get(duplicateRef)]);
        if (!canonicalSnap.exists || !duplicateSnap.exists || duplicateSnap.data()?.mergeStatus === "MERGED") return;
        const canonical = canonicalSnap.data()!, duplicate = duplicateSnap.data()!, now = new Date().toISOString();
        transaction.update(canonicalRef, {
          sourceKeys: [...new Set([...(canonical.sourceKeys || []), ...(duplicate.sourceKeys || [])])],
          sourceReferences: unionObjects(canonical.sourceReferences, duplicate.sourceReferences),
          historicalComments: unionObjects(canonical.historicalComments, duplicate.historicalComments),
          auditTrail: [...unionObjects(canonical.auditTrail, duplicate.auditTrail), { action: "DUPLICATE_CONSOLIDATED", duplicateRaidId: match.duplicate.id, at: now }],
          detectionCount: Number(canonical.detectionCount || 1) + Number(duplicate.detectionCount || 1),
          mergeStatus: "CANONICAL",
          lastMergedAt: now,
        });
        transaction.update(duplicateRef, { mergeStatus: "MERGED", mergedIntoRaidId: match.canonical.id, mergedAt: now, preMergeStatus: duplicate.status || null, status: "Merged" });
        consolidatedCount++;
      });
    }
    return NextResponse.json({ mode: "apply", candidateGroupCount: report.length, consolidatedCount, candidates: report, ambiguous });
  } catch (error: any) {
    console.error("RAID deduplication error:", error);
    return NextResponse.json({ error: error.message || "Deduplication failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { buildRaidSuppression, suppressThenDeleteRaid } from "@/lib/raid-governance";
import { raidSuppressionId } from "@/lib/risk-utils";

const AUTHORIZED_RAID_NUMBERS = [
  "RAID-1033", "RAID-1030", "RAID-1043", "RAID-1005", "RAID-1032", "RAID-1020",
  "RAID-1017", "RAID-1022", "RAID-1028", "RAID-1012", "RAID-1001", "RAID-1009",
  "RAID-1026", "RAID-1002", "RAID-1031", "RAID-1037", "RAID-1014",
] as const;

const requestSchema = z.object({ confirmation: z.literal("DELETE_AUTHORIZED_RAID_RECORDS") }).strict();
const pmFields = ["title", "description", "owner", "assignedOwner", "status", "probability", "importance", "mitigation", "dispositionNotes", "historicalComments", "auditTrail", "auditTrailHistory", "roamCategory"];

function survivorSignature(data: Record<string, any>) {
  return JSON.stringify({
    raidNumber: data.raidNumber || null,
    projectId: data.projectId || null,
    projectName: data.projectName || null,
    pm: Object.fromEntries(pmFields.map(field => [field, data[field] ?? null])),
  });
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth.verifyIdToken(token);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Explicit cleanup confirmation is required." }, { status: 400 });

    const beforeSnapshot = await admin.db.collection("raid_matrix").get();
    const beforeCounter = await admin.db.collection("counters").doc("raid_records").get();
    const byRaidNumber = new Map(beforeSnapshot.docs.map(document => [String(document.data().raidNumber || document.id), document]));
    const targetDocumentIds = new Set(AUTHORIZED_RAID_NUMBERS.map(number => byRaidNumber.get(number)?.id).filter((id): id is string => Boolean(id)));
    const survivorBefore = new Map(beforeSnapshot.docs.filter(document => !targetDocumentIds.has(document.id)).map(document => [document.id, survivorSignature(document.data())]));

    const deletedRaidNumbers: string[] = [];
    const deletedDocumentIds: string[] = [];
    const suppressionIds: string[] = [];
    const notFound: string[] = [];
    const errors: Array<{ raidNumber: string; error: string }> = [];

    for (const raidNumber of AUTHORIZED_RAID_NUMBERS) {
      const document = byRaidNumber.get(raidNumber);
      if (!document) {
        notFound.push(raidNumber);
        continue;
      }
      try {
        const data = document.data();
        const suppressionRef = admin.db.collection("raid_suppressions").doc(raidSuppressionId(document.id));
        const suppression = buildRaidSuppression(data, {
          documentId: document.id,
          disposition: "PM_REJECTED",
          reviewedBy: decoded.email || decoded.uid,
          reviewedAt: new Date().toISOString(),
          reason: "Program Manager-authorized RAID registry cleanup.",
        });
        await suppressThenDeleteRaid({
          persistSuppression: async () => { await suppressionRef.set(suppression, { merge: false }); },
          suppressionExists: async () => {
            const stored = await suppressionRef.get();
            return stored.exists && stored.data()?.deletedRaidNumber === raidNumber && stored.data()?.deletedRaidDocumentId === document.id;
          },
          deleteRaid: async () => { await document.ref.delete(); },
          raidExists: async () => (await document.ref.get()).exists,
        });
        deletedRaidNumbers.push(raidNumber);
        deletedDocumentIds.push(document.id);
        suppressionIds.push(suppressionRef.id);
      } catch (error: any) {
        errors.push({ raidNumber, error: error.message || "Unknown cleanup failure." });
      }
    }

    const afterSnapshot = await admin.db.collection("raid_matrix").get();
    const afterCounter = await admin.db.collection("counters").doc("raid_records").get();
    const afterById = new Map(afterSnapshot.docs.map(document => [document.id, document.data()]));
    const changedSurvivors = [...survivorBefore.entries()]
      .filter(([id, signature]) => !afterById.has(id) || survivorSignature(afterById.get(id)!) !== signature)
      .map(([id]) => id);
    const stillPresent = AUTHORIZED_RAID_NUMBERS.filter(number => afterSnapshot.docs.some(document => String(document.data().raidNumber || document.id) === number));
    const suppressionSnapshot = await admin.db.collection("raid_suppressions").where("deletedRaidNumber", "in", [...AUTHORIZED_RAID_NUMBERS]).get();
    const counterBefore = Number(beforeCounter.data()?.lastSequence || 0);
    const counterAfter = Number(afterCounter.data()?.lastSequence || 0);

    return NextResponse.json({
      success: errors.length === 0 && stillPresent.length === 0,
      requested: AUTHORIZED_RAID_NUMBERS.length,
      deleted: deletedRaidNumbers.length,
      notFound: notFound.length,
      suppressionCreated: suppressionIds.length,
      errors: errors.length,
      raidRecordsBefore: beforeSnapshot.size,
      raidRecordsAfter: afterSnapshot.size,
      counterBefore,
      counterAfter,
      counterUnchanged: counterBefore === counterAfter,
      survivingRaidNumbersChanged: changedSurvivors.length > 0,
      survivingRecordsChanged: changedSurvivors,
      deletedRaidNumbers,
      deletedDocumentIds,
      suppressionIds,
      verifiedSuppressionCount: suppressionSnapshot.size,
      stillPresent,
      notFoundRaidNumbers: notFound,
      errorDetails: errors,
    });
  } catch (error: any) {
    console.error("Authorized RAID cleanup failed:", error);
    return NextResponse.json({ error: error.message || "Authorized RAID cleanup failed." }, { status: 500 });
  }
}

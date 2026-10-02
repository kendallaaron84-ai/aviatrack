export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { buildRaidSuppression, suppressThenDeleteRaid } from "@/lib/raid-governance";
import { raidSuppressionId } from "@/lib/risk-utils";

const deleteSchema = z.object({
  disposition: z.enum(["PM_REJECTED", "DUPLICATE", "CREATED_IN_ERROR"]),
  reason: z.string().trim().max(500).optional(),
  canonicalRaidId: z.string().trim().optional(),
  canonicalRaidNumber: z.string().trim().optional(),
}).strict();

const archiveSchema = z.object({ action: z.enum(["ARCHIVE", "RESTORE"]) }).strict();

function tokenFrom(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = tokenFrom(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth.verifyIdToken(token);
    const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });
    const { id } = await context.params;
    const raidRef = admin.db.collection("raid_matrix").doc(id);
    const raidSnapshot = await raidRef.get();
    if (!raidSnapshot.exists) return NextResponse.json({ error: "RAID record not found." }, { status: 404 });

    const raidData = raidSnapshot.data()!;
    const reviewedAt = new Date().toISOString();
    const suppressionRef = admin.db.collection("raid_suppressions").doc(raidSuppressionId(id));
    const suppression = buildRaidSuppression(raidData, {
      documentId: id,
      disposition: parsed.data.disposition,
      reviewedBy: decoded.email || decoded.uid,
      reviewedAt,
      reason: parsed.data.reason,
      canonicalRaidId: parsed.data.canonicalRaidId,
      canonicalRaidNumber: parsed.data.canonicalRaidNumber,
    });

    await suppressThenDeleteRaid({
      persistSuppression: async () => { await suppressionRef.set(suppression, { merge: false }); },
      suppressionExists: async () => {
        const stored = await suppressionRef.get();
        return stored.exists && stored.data()?.deletedRaidDocumentId === id && stored.data()?.deletedRaidNumber === suppression.deletedRaidNumber;
      },
      deleteRaid: async () => { await raidRef.delete(); },
      raidExists: async () => (await raidRef.get()).exists,
    });

    return NextResponse.json({
      success: true,
      deletedRaidNumber: suppression.deletedRaidNumber,
      deletedDocumentId: id,
      suppressionId: suppressionRef.id,
    });
  } catch (error: any) {
    console.error("RAID delete operation failed:", error);
    return NextResponse.json({ error: error.message || "RAID delete operation failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = tokenFrom(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth.verifyIdToken(token);
    const parsed = archiveSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });
    const { id } = await context.params;
    const raidRef = admin.db.collection("raid_matrix").doc(id);
    const now = new Date().toISOString();

    const result = await admin.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(raidRef);
      if (!snapshot.exists) throw new Error("RAID record not found.");
      const data = snapshot.data()!;
      const auditTrail = Array.isArray(data.auditTrail) ? data.auditTrail : [];
      if (parsed.data.action === "ARCHIVE") {
        transaction.update(raidRef, {
          archived: true,
          archivedAt: now,
          archivedBy: decoded.email || decoded.uid,
          preArchiveStatus: data.status || "Identified",
          status: "Archived",
          auditTrail: [...auditTrail, { action: "RAID_ARCHIVED", at: now, by: decoded.email || decoded.uid }],
        });
        return { archived: true, raidNumber: data.raidNumber || id };
      }
      transaction.update(raidRef, {
        archived: false,
        restoredAt: now,
        restoredBy: decoded.email || decoded.uid,
        status: data.preArchiveStatus || "Identified",
        auditTrail: [...auditTrail, { action: "RAID_RESTORED", at: now, by: decoded.email || decoded.uid }],
      });
      return { archived: false, raidNumber: data.raidNumber || id };
    });

    const verified = await raidRef.get();
    const isArchived = verified.data()?.archived === true || verified.data()?.status === "Archived";
    if (isArchived !== result.archived) throw new Error("Archive state verification failed.");
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("RAID archive operation failed:", error);
    return NextResponse.json({ error: error.message || "RAID archive operation failed." }, { status: 500 });
  }
}

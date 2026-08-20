export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { buildRaidNumberingMapping } from "@/lib/raid-display-utils";

const requestSchema = z.object({ mode: z.enum(["dry-run", "apply"]).default("dry-run") }).strict();

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getFirebaseAdmin();
    await admin.auth.verifyIdToken(token);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });

    const collectionRef = admin.db.collection("raid_matrix");
    if (parsed.data.mode === "dry-run") {
      const snapshot = await collectionRef.get();
      const mapping = buildRaidNumberingMapping(snapshot.docs.map(document => ({ id: document.id, data: document.data() })));
      const uniqueNumbers = new Set(mapping.map(entry => entry.raidNumber));
      return NextResponse.json({
        mode: "dry-run",
        activeCanonicalCount: mapping.length,
        uniqueRaidNumberCount: uniqueNumbers.size,
        duplicateRaidNumberCount: mapping.length - uniqueNumbers.size,
        firstRaidNumber: mapping[0]?.raidNumber || null,
        lastRaidNumber: mapping.at(-1)?.raidNumber || null,
        mapping,
      });
    }

    const result = await admin.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(collectionRef);
      const documents = snapshot.docs.map(document => ({ id: document.id, data: document.data() }));
      const mapping = buildRaidNumberingMapping(documents);
      const numberByDocumentId = new Map(mapping.map(entry => [entry.firestoreDocumentId, entry.raidNumber]));
      const now = new Date().toISOString();

      for (const entry of mapping) {
        transaction.update(collectionRef.doc(entry.firestoreDocumentId), {
          raidNumber: entry.raidNumber,
          raidSequence: entry.raidSequence,
          numberingVersion: 1,
        });
      }

      for (const document of documents.filter(candidate => candidate.data.mergeStatus === "MERGED")) {
        const mergedIntoRaidNumber = numberByDocumentId.get(String(document.data.mergedIntoRaidId || ""));
        if (mergedIntoRaidNumber) transaction.update(collectionRef.doc(document.id), { mergedIntoRaidNumber });
      }

      const lastSequence = mapping.at(-1)?.raidSequence || 1000;
      transaction.set(admin.db.collection("counters").doc("raid_records"), {
        kind: "raid_business_number",
        lastSequence,
        updatedAt: now,
      }, { merge: true });

      return { mapping, lastSequence };
    });

    return NextResponse.json({
      mode: "apply",
      activeCanonicalCount: result.mapping.length,
      numberedCount: result.mapping.length,
      firstRaidNumber: result.mapping[0]?.raidNumber || null,
      lastRaidNumber: result.mapping.at(-1)?.raidNumber || null,
      counterValue: result.lastSequence,
      duplicateRaidNumberCount: result.mapping.length - new Set(result.mapping.map(entry => entry.raidNumber)).size,
      mapping: result.mapping,
    });
  } catch (error: any) {
    console.error("RAID numbering migration error:", error);
    return NextResponse.json({ error: error.message || "RAID numbering migration failed" }, { status: 500 });
  }
}

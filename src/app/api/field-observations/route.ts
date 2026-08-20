export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FIRST_FIELD_OBSERVATION_SEQUENCE, formatReportNumber } from "@/lib/field-observation-utils";

const payloadSchema = z.object({
  submittedBy: z.string(),
  submittedAt: z.string(),
  program: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  stage: z.string(),
  location: z.string(),
  isExterior: z.boolean(),
  weather: z.string(),
  buildingLevel: z.string(),
  sector: z.string(),
  presentAtSite: z.string(),
  status: z.string(),
  search_tags: z.array(z.string()),
}).strict();

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth.verifyIdToken(token);
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });
    }

    const counterRef = admin.db.collection("counters").doc("field_observations");
    const reportRef = admin.db.collection("field_observations").doc();
    const allocation = await admin.db.runTransaction(async transaction => {
      const counterSnap = await transaction.get(counterRef);
      let lastSequence = counterSnap.exists ? Number(counterSnap.data()?.lastSequence) : FIRST_FIELD_OBSERVATION_SEQUENCE - 1;

      if (!counterSnap.exists) {
        const latestNumbered = await transaction.get(
          admin.db.collection("field_observations").orderBy("sequenceNumber", "desc").limit(1),
        );
        const existingSequence = latestNumbered.empty ? 0 : Number(latestNumbered.docs[0].data().sequenceNumber);
        if (Number.isInteger(existingSequence)) lastSequence = Math.max(lastSequence, existingSequence);
      }

      const sequenceNumber = Math.max(FIRST_FIELD_OBSERVATION_SEQUENCE, lastSequence + 1);
      const reportNumber = formatReportNumber(sequenceNumber);
      const allocatedAt = new Date().toISOString();

      transaction.set(counterRef, { lastSequence: sequenceNumber, updatedAt: allocatedAt }, { merge: true });
      transaction.set(reportRef, {
        ...parsed.data,
        submittedBy: decoded.email || decoded.uid,
        reportNumber,
        sequenceNumber,
        numberingVersion: 1,
      });
      return { id: reportRef.id, reportNumber, sequenceNumber };
    });

    return NextResponse.json(allocation, { status: 201 });
  } catch (error: any) {
    console.error("Field Observation allocation failed:", error);
    return NextResponse.json({ error: error.message || "Unable to allocate Field Observation number." }, { status: 500 });
  }
}

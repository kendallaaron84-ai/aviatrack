export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CLOSED_RAID_STATUSES, deterministicRaidId, fieldObservationSourceKey, journalSourceKey, normalizeRiskText, raidProjectLockId, riskSimilarity } from "@/lib/risk-utils";
import { formatRaidNumber, normalizeRaidProbability } from "@/lib/raid-display-utils";

const requestSchema = z.object({ force: z.boolean().optional() }).strict();
const analyzedItemSchema = z.object({ title: z.string(), description: z.string(), classification: z.enum(["Risk", "Assumption", "Issue", "Dependency"]), importance: z.enum(["Critical", "Mandatory", "High", "Medium", "Low"]), probability: z.coerce.number().int().min(1).max(4) });
const analysisSchema = z.object({ items: z.array(z.object({ inputIndex: z.number().int().nonnegative(), analysis: analyzedItemSchema })) });
const relationshipSchema = z.object({ relationship: z.enum(["NEW_RISK", "RELATED_EXISTING_RISK", "SAME_RISK"]), existingRaidId: z.string().optional(), confidence: z.number().min(0).max(1) });

type SourceReference = { sourceKey: string; sourceType: "Project Journal" | "Field Observation"; sourceDocumentId: string; parentDocumentId?: string; projectId: string; observedAt?: string; text: string };
const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();

const LEASE_DURATION_MS = 5 * 60 * 1000;
const LEASE_RETRY_COUNT = 40;
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

class ProjectIngestionBusyError extends Error {
  constructor(projectId: string) {
    super(`RAID ingestion is already processing project ${projectId}. Retry the request.`);
    this.name = "ProjectIngestionBusyError";
  }
}

async function acquireProjectLease(db: Firestore, projectId: string): Promise<{ ref: DocumentReference; ownerToken: string }> {
  const ref = db.collection("counters").doc(raidProjectLockId(projectId));
  const ownerToken = randomUUID();
  for (let attempt = 0; attempt < LEASE_RETRY_COUNT; attempt++) {
    const acquired = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const now = Date.now();
      if (snapshot.exists && Number(snapshot.data()?.leaseExpiresAt || 0) > now) return false;
      transaction.set(ref, { kind: "raid_ingestion_lock", projectId, ownerToken, leaseExpiresAt: now + LEASE_DURATION_MS, updatedAt: new Date(now).toISOString() });
      return true;
    });
    if (acquired) return { ref, ownerToken };
    await wait(250);
  }
  throw new ProjectIngestionBusyError(projectId);
}

async function releaseProjectLease(db: Firestore, lease: { ref: DocumentReference; ownerToken: string }) {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(lease.ref);
    if (snapshot.exists && snapshot.data()?.ownerToken === lease.ownerToken) transaction.delete(lease.ref);
  });
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getFirebaseAdmin();
    await admin.auth.verifyIdToken(token);
    const body = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Bad Request", details: body.error.flatten() }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing critical Gemini API Key." }, { status: 400 });
    const ai = new GoogleGenAI({ apiKey });
    const db = admin.db;
    const [journalSnapshot, fieldSnapshot] = await Promise.all([
      db.collectionGroup("entries").limit(25).get(),
      db.collectionGroup("sub_observations").where("observationType", "==", "Risk").limit(25).get(),
    ]);

    const parentIds = [...new Set(fieldSnapshot.docs.map(doc => doc.ref.parent.parent?.id).filter((id): id is string => Boolean(id)))];
    const parentDocs = await Promise.all(parentIds.map(id => db.collection("field_observations").doc(id).get()));
    const parents = new Map(parentDocs.map(doc => [doc.id, doc.data() || {}]));
    const sources: SourceReference[] = [];

    journalSnapshot.forEach(doc => {
      const projectId = doc.ref.parent.parent?.id || "Global";
      const data = doc.data();
      if (data.text) sources.push({ sourceKey: journalSourceKey(projectId, doc.id), sourceType: "Project Journal", sourceDocumentId: doc.id, projectId, observedAt: data.timestamp, text: data.text });
    });
    fieldSnapshot.forEach(doc => {
      const parentId = doc.ref.parent.parent?.id || "Global";
      const parent = parents.get(parentId) || {};
      const data = doc.data();
      if (data.description) sources.push({ sourceKey: fieldObservationSourceKey(parentId, doc.id, parent.reportNumber, data.itemNumber), sourceType: "Field Observation", sourceDocumentId: doc.id, parentDocumentId: parentId, projectId: parent.projectId || "Global", observedAt: data.createdAt || parent.submittedAt, text: data.description });
    });
    if (!sources.length) return NextResponse.json({ message: "No active text logs or risk updates found to evaluate.", processedCount: 0 });

    const riskProfile = await db.collection("admin_settings").doc("risk_profile").get();
    const systemInstruction = riskProfile.data()?.riskPrompt || "You are an expert infrastructure construction systems risk evaluator.";
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze each indexed source independently. Return one structured analysis per source index. Do not create or infer source identifiers.\n\n${sources.map((source, index) => `[${index}] Project: ${source.projectId}; Source: ${source.sourceType}; Text: ${source.text}`).join("\n\n")}`,
      config: { systemInstruction, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { inputIndex: { type: "INTEGER" }, analysis: { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" }, classification: { type: "STRING", enum: ["Risk", "Assumption", "Issue", "Dependency"] }, importance: { type: "STRING", enum: ["Critical", "Mandatory", "High", "Medium", "Low"] }, probability: { type: "INTEGER", minimum: 1, maximum: 4 } }, required: ["title", "description", "classification", "importance", "probability"] } }, required: ["inputIndex", "analysis"] } } }, required: ["items"] } },
    });
    const rawAnalysis = JSON.parse(cleanJson(response.text || "{\"items\":[]}"));
    if (Array.isArray(rawAnalysis?.items)) {
      rawAnalysis.items = rawAnalysis.items.map((item: any) => ({
        ...item,
        analysis: item?.analysis ? { ...item.analysis, probability: normalizeRaidProbability(item.analysis.probability) } : item?.analysis,
      }));
    }
    const analyzed = analysisSchema.parse(rawAnalysis);
    const projectDocs = await db.collection("admin_projects").get();
    const projectNames = new Map(projectDocs.docs.map(doc => [doc.id, String(doc.data().name || doc.data().projectName || doc.id)]));
    let createdCount = 0, mergedCount = 0, skippedCount = 0;
    const createdRecords: Array<{ raidId: string; projectId: string; projectName: string; probability: number }> = [];
    const mergedRecords: Array<{ canonicalRaidId: string | null; canonicalDocumentId: string; projectId: string }> = [];

    for (const result of analyzed.items) {
      const source = sources[result.inputIndex];
      if (!source) {
        skippedCount++;
        continue;
      }
      const lease = await acquireProjectLease(db, source.projectId);
      try {
      const sourceRef = db.collection("raid_matrix").doc(deterministicRaidId(source.sourceKey));
      const candidatesSnap = await db.collection("raid_matrix").where("projectId", "==", source.projectId).get();
      const activeCandidates = candidatesSnap.docs.filter(doc => {
        const data = doc.data();
        return doc.id !== sourceRef.id && data.mergeStatus !== "MERGED" && !CLOSED_RAID_STATUSES.has(normalizeRiskText(data.status));
      });
      let target = activeCandidates.find(doc => (doc.data().sourceKeys || []).includes(source.sourceKey));
      if (!target) target = activeCandidates.find(doc => normalizeRiskText(doc.data().title) === normalizeRiskText(result.analysis.title) || riskSimilarity(`${doc.data().title} ${doc.data().description}`, `${result.analysis.title} ${result.analysis.description}`) >= 0.85);

      if (!target && activeCandidates.length) {
        const semantic = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Compare the detected risk with same-project active candidates. Be conservative.\nDetected: ${JSON.stringify(result.analysis)}\nCandidates: ${JSON.stringify(activeCandidates.map(doc => ({ id: doc.id, title: doc.data().title, description: doc.data().description })))}`,
          config: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { relationship: { type: "STRING", enum: ["NEW_RISK", "RELATED_EXISTING_RISK", "SAME_RISK"] }, existingRaidId: { type: "STRING" }, confidence: { type: "NUMBER" } }, required: ["relationship", "confidence"] } },
        });
        const relationship = relationshipSchema.parse(JSON.parse(cleanJson(semantic.text || "{}")));
        if (relationship.relationship !== "NEW_RISK" && relationship.confidence >= 0.9 && relationship.existingRaidId) target = activeCandidates.find(doc => doc.id === relationship.existingRaidId);
      }

      const outcome = await db.runTransaction(async transaction => {
        const existingSource = await transaction.get(sourceRef);
        if (existingSource.exists) return { kind: "skipped" as const };
        const now = new Date().toISOString();
        const evidence = { sourceKey: source.sourceKey, sourceType: source.sourceType, sourceDocumentId: source.sourceDocumentId, ...(source.parentDocumentId ? { parentDocumentId: source.parentDocumentId } : {}), ...(source.observedAt ? { observedAt: source.observedAt } : {}), addedAt: now };

        if (target) {
          const targetSnap = await transaction.get(target.ref);
          if (!targetSnap.exists) throw new Error("Selected canonical RAID record no longer exists; retry ingestion.");
          const data = targetSnap.data()!;
          transaction.update(target.ref, { sourceKey: data.sourceKey || source.sourceKey, sourceKeys: [...new Set([...(data.sourceKeys || (data.sourceKey ? [data.sourceKey] : [])), source.sourceKey])], sourceReferences: [...(data.sourceReferences || []), evidence], lastDetectedAt: now, detectionCount: Number(data.detectionCount || 1) + 1, auditTrail: [...(data.auditTrail || []), { action: "EVIDENCE_MERGED", sourceKey: source.sourceKey, at: now }], mergeStatus: "CANONICAL" });
          transaction.set(sourceRef, { projectId: source.projectId, sourceKey: source.sourceKey, sourceKeys: [source.sourceKey], sourceReferences: [evidence], mergeStatus: "MERGED", mergedIntoRaidId: target.id, mergedIntoRaidNumber: data.raidNumber || null, mergedAt: now, status: "Merged", createdAt: now });
          return {
            kind: "merged" as const,
            canonicalRaidId: typeof data.raidNumber === "string" ? data.raidNumber : null,
            canonicalDocumentId: target.id,
            projectId: String(data.projectId || source.projectId),
          };
        }

        const counterRef = db.collection("counters").doc("raid_records");
        const counterSnap = await transaction.get(counterRef);
        let lastSequence = Number(counterSnap.data()?.lastSequence || 1000);
        if (!counterSnap.exists) {
          const latestNumbered = await transaction.get(db.collection("raid_matrix").orderBy("raidSequence", "desc").limit(1));
          lastSequence = Number(latestNumbered.docs[0]?.data().raidSequence || 1000);
        }
        const raidSequence = Math.max(1000, lastSequence) + 1;
        const raidNumber = formatRaidNumber(raidSequence);
        const assignedOwner = ["Dependency", "Issue"].includes(result.analysis.classification) ? "IT Consultant" : "ORAT Team";
        const textPool = [result.analysis.title, result.analysis.description, result.analysis.classification, source.projectId].join(" ").toLowerCase();
        transaction.set(counterRef, { kind: "raid_business_number", lastSequence: raidSequence, updatedAt: now }, { merge: true });
        transaction.set(sourceRef, { ...result.analysis, raidNumber, raidSequence, numberingVersion: 1, projectId: source.projectId, projectName: projectNames.get(source.projectId) || source.projectId, sourceReferenceId: source.sourceDocumentId, sourceType: source.sourceType, sourceKey: source.sourceKey, sourceKeys: [source.sourceKey], sourceReferences: [evidence], roamCategory: "New / Unassigned", impactLevel: result.analysis.importance, status: "Identified", assignedOwner, isItOwned: assignedOwner === "IT Consultant", dispositionNotes: "", historicalComments: [], auditTrail: [{ action: "RISK_CREATED", sourceKey: source.sourceKey, raidNumber, at: now }], detectionCount: 1, lastDetectedAt: now, mergeStatus: "CANONICAL", analyzedAt: now, createdAt: now, search_tags: [...new Set(textPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(word => word.length > 1))] });
        return {
          kind: "created" as const,
          raidId: raidNumber,
          projectId: source.projectId,
          projectName: projectNames.get(source.projectId) || source.projectId,
          probability: result.analysis.probability,
        };
      });
      if (outcome.kind === "created") {
        createdCount++;
        createdRecords.push({ raidId: outcome.raidId, projectId: outcome.projectId, projectName: outcome.projectName, probability: outcome.probability });
      } else if (outcome.kind === "merged") {
        mergedCount++;
        mergedRecords.push({ canonicalRaidId: outcome.canonicalRaidId, canonicalDocumentId: outcome.canonicalDocumentId, projectId: outcome.projectId });
      } else {
        skippedCount++;
      }
      } finally {
        await releaseProjectLease(db, lease);
      }
    }

    const counterSnapshot = await db.collection("counters").doc("raid_records").get();
    return NextResponse.json({
      success: true,
      processedCount: analyzed.items.length,
      createdCount,
      mergedCount,
      skippedCount,
      errorCount: 0,
      createdRecords,
      mergedRecords,
      counterValue: Number(counterSnapshot.data()?.lastSequence || 0),
    });
  } catch (error: any) {
    console.error("RAID Pipeline Error:", error);
    return NextResponse.json({ error: error.message, errorCount: 1 }, { status: error instanceof ProjectIngestionBusyError ? 409 : 500 });
  }
}

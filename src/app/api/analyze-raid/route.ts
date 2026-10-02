export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CLOSED_RAID_STATUSES, deterministicRaidId, fieldObservationSourceKey, journalSourceKey, normalizeRiskText, raidProjectLockId } from "@/lib/risk-utils";
import { formatRaidNumber, nextRaidSequence, normalizeRaidProbability } from "@/lib/raid-display-utils";
import { gateRaidProposal, type RaidAnalysis, type RaidCandidate, type RaidProposal, type RaidSuppression } from "@/lib/raid-governance";

const requestSchema = z.object({ force: z.boolean().optional() }).strict();
const analyzedItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  classification: z.enum(["Risk", "Assumption", "Issue", "Dependency"]),
  importance: z.enum(["Critical", "Mandatory", "High", "Medium", "Low"]),
  probability: z.coerce.number().int().min(1).max(4),
});
const proposalSchema = z.object({
  inputIndex: z.number().int().nonnegative(),
  action: z.enum(["NO_RAID", "MERGE_EVIDENCE", "NEW_RAID"]),
  existingRaidId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  analysis: analyzedItemSchema.optional(),
});
const analysisSchema = z.object({ items: z.array(proposalSchema) });
const semanticGateSchema = z.object({
  action: z.enum(["NO_RAID", "MERGE_EVIDENCE", "SUPPRESSED", "NEW_RAID"]),
  existingRaidId: z.string().optional(),
  suppressionId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

type SourceReference = {
  sourceKey: string;
  sourceType: "Project Journal" | "Field Observation";
  sourceDocumentId: string;
  parentDocumentId?: string;
  projectId: string;
  observedAt?: string;
  text: string;
};

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

function activeCandidateDocuments(snapshot: FirebaseFirestore.QuerySnapshot, projectId: string, sourceDocumentId?: string) {
  return snapshot.docs.filter(document => {
    const data = document.data();
    return document.id !== sourceDocumentId &&
      data.projectId === projectId &&
      data.mergeStatus !== "MERGED" &&
      data.archived !== true &&
      !CLOSED_RAID_STATUSES.has(normalizeRiskText(data.status));
  });
}

function candidateShape(document: FirebaseFirestore.QueryDocumentSnapshot): RaidCandidate {
  const data = document.data();
  return { id: document.id, projectId: String(data.projectId || "Unassigned"), title: data.title, description: data.description, sourceKey: data.sourceKey, sourceKeys: data.sourceKeys };
}

function suppressionShape(document: FirebaseFirestore.QueryDocumentSnapshot): RaidSuppression {
  const data = document.data();
  return { id: document.id, projectId: String(data.projectId || "Unassigned"), sourceKey: data.sourceKey, sourceKeys: data.sourceKeys, normalizedTitle: data.normalizedTitle, normalizedRiskFingerprint: data.normalizedRiskFingerprint, disposition: data.disposition };
}

async function rememberSuppressedSource(db: Firestore, suppressionId: string | undefined, source: SourceReference) {
  if (!suppressionId) return;
  await db.collection("raid_suppressions").doc(suppressionId).update({ sourceKeys: FieldValue.arrayUnion(source.sourceKey), lastMatchedAt: new Date().toISOString(), lastMatchedSourceType: source.sourceType });
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
    const [journalSnapshot, fieldSnapshot, initialRaidSnapshot, initialSuppressionSnapshot, projectDocs] = await Promise.all([
      db.collectionGroup("entries").limit(25).get(),
      db.collectionGroup("sub_observations").where("observationType", "==", "Risk").limit(25).get(),
      db.collection("raid_matrix").get(),
      db.collection("raid_suppressions").get(),
      db.collection("admin_projects").get(),
    ]);

    const parentIds = [...new Set(fieldSnapshot.docs.map(document => document.ref.parent.parent?.id).filter((id): id is string => Boolean(id)))];
    const parentDocs = await Promise.all(parentIds.map(id => db.collection("field_observations").doc(id).get()));
    const parents = new Map(parentDocs.map(document => [document.id, document.data() || {}]));
    const projectNames = new Map(projectDocs.docs.map(document => [document.id, String(document.data().name || document.data().projectName || document.id)]));
    const sources: SourceReference[] = [];
    journalSnapshot.forEach(document => {
      const projectId = document.ref.parent.parent?.id || "Global";
      const data = document.data();
      if (data.text) sources.push({ sourceKey: journalSourceKey(projectId, document.id), sourceType: "Project Journal", sourceDocumentId: document.id, projectId, observedAt: data.timestamp, text: data.text });
    });
    fieldSnapshot.forEach(document => {
      const parentId = document.ref.parent.parent?.id || "Global";
      const parent = parents.get(parentId) || {};
      const data = document.data();
      if (data.description) sources.push({ sourceKey: fieldObservationSourceKey(parentId, document.id, parent.reportNumber, data.itemNumber), sourceType: "Field Observation", sourceDocumentId: document.id, parentDocumentId: parentId, projectId: parent.projectId || "Global", observedAt: data.createdAt || parent.submittedAt, text: data.description });
    });
    if (!sources.length) return NextResponse.json({ success: true, message: "No active text logs or risk updates found to evaluate.", processedCount: 0, createdCount: 0, mergedCount: 0, suppressedCount: 0, noRaidCount: 0, skippedCount: 0, errorCount: 0 });

    const initialSuppressions = initialSuppressionSnapshot.docs.map(suppressionShape);
    const preflightSuppressed = new Map<number, RaidSuppression>();
    const preflightSkipped = new Set<number>();
    const processableIndexes: number[] = [];
    sources.forEach((source, index) => {
      const suppression = initialSuppressions.find(item => item.projectId === source.projectId && (item.sourceKey === source.sourceKey || (item.sourceKeys || []).includes(source.sourceKey)));
      if (suppression) preflightSuppressed.set(index, suppression);
      else if (initialRaidSnapshot.docs.some(document => document.id === deterministicRaidId(source.sourceKey))) preflightSkipped.add(index);
      else processableIndexes.push(index);
    });

    const systemInstruction = (await db.collection("admin_settings").doc("risk_profile").get()).data()?.riskPrompt || "You are an expert infrastructure construction systems risk evaluator.";
    let proposalsByIndex = new Map<number, z.infer<typeof proposalSchema>>();
    if (processableIndexes.length > 0) {
      const decisionInputs = processableIndexes.map(index => {
        const source = sources[index];
        const candidates = activeCandidateDocuments(initialRaidSnapshot, source.projectId).slice(0, 30).map(document => ({ id: document.id, title: document.data().title, description: String(document.data().description || "").slice(0, 800) }));
        const suppressions = initialSuppressions.filter(item => item.projectId === source.projectId).slice(0, 30).map(item => ({ id: item.id, normalizedTitle: item.normalizedTitle, normalizedRiskFingerprint: item.normalizedRiskFingerprint }));
        return { inputIndex: index, projectId: source.projectId, sourceType: source.sourceType, sourceText: source.text.slice(0, 4000), activeSameProjectRaid: candidates, sameProjectSuppressions: suppressions };
      });
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: `Evaluate every indexed source. Gemini is proposing an action, not authorizing a database write. Creation is the most conservative outcome. Use NO_RAID for informational, vague, insufficiently supported, or non-actionable text. Use MERGE_EVIDENCE when a same-project active RAID already represents the condition. Use NEW_RAID only for a materially distinct, sufficiently supported condition absent from both active RAID and suppression context. Never compare across projects. Return exactly one item per inputIndex. analysis is required for MERGE_EVIDENCE and NEW_RAID.\n\n${JSON.stringify(decisionInputs)}`,
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: {
          type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: {
            inputIndex: { type: "INTEGER" }, action: { type: "STRING", enum: ["NO_RAID", "MERGE_EVIDENCE", "NEW_RAID"] }, existingRaidId: { type: "STRING" }, confidence: { type: "NUMBER" }, rationale: { type: "STRING" },
            analysis: { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" }, classification: { type: "STRING", enum: ["Risk", "Assumption", "Issue", "Dependency"] }, importance: { type: "STRING", enum: ["Critical", "Mandatory", "High", "Medium", "Low"] }, probability: { type: "INTEGER", minimum: 1, maximum: 4 } }, required: ["title", "description", "classification", "importance", "probability"] },
          }, required: ["inputIndex", "action", "confidence", "rationale"] } } }, required: ["items"] },
        },
      });
      const rawAnalysis = JSON.parse(cleanJson(response.text || "{\"items\":[]}"));
      if (Array.isArray(rawAnalysis?.items)) rawAnalysis.items = rawAnalysis.items.map((item: any) => ({ ...item, analysis: item?.analysis ? { ...item.analysis, probability: normalizeRaidProbability(item.analysis.probability) } : undefined }));
      const analyzed = analysisSchema.parse(rawAnalysis);
      proposalsByIndex = new Map(analyzed.items.map(item => [item.inputIndex, item]));
    }

    let createdCount = 0, mergedCount = 0, suppressedCount = preflightSuppressed.size, noRaidCount = 0, skippedCount = preflightSkipped.size, errorCount = 0;
    const createdRecords: Array<{ raidId: string; projectId: string; projectName: string; probability: number }> = [];
    const mergedRecords: Array<{ canonicalRaidId: string | null; canonicalDocumentId: string; projectId: string }> = [];
    const errorRecords: Array<{ sourceKey: string; error: string }> = [];
    for (const [index, suppression] of preflightSuppressed) await rememberSuppressedSource(db, suppression.id, sources[index]);

    for (const index of processableIndexes) {
      const source = sources[index];
      const proposed = proposalsByIndex.get(index);
      if (!proposed) { skippedCount++; continue; }
      let lease: { ref: DocumentReference; ownerToken: string } | undefined;
      try {
        lease = await acquireProjectLease(db, source.projectId);
        const [raidSnapshot, suppressionSnapshot] = await Promise.all([
          db.collection("raid_matrix").where("projectId", "==", source.projectId).get(),
          db.collection("raid_suppressions").where("projectId", "==", source.projectId).get(),
        ]);
        const sourceRef = db.collection("raid_matrix").doc(deterministicRaidId(source.sourceKey));
        const candidateDocuments = activeCandidateDocuments(raidSnapshot, source.projectId, sourceRef.id);
        const candidates = candidateDocuments.map(candidateShape);
        const suppressions = suppressionSnapshot.docs.map(suppressionShape);
        const proposal: RaidProposal = { action: proposed.action, existingRaidId: proposed.existingRaidId, confidence: proposed.confidence, rationale: proposed.rationale, analysis: proposed.analysis as RaidAnalysis | undefined };
        let gate = gateRaidProposal({ sourceKey: source.sourceKey, sourceText: source.text, projectId: source.projectId, proposal, candidates, suppressions });
        if (gate.outcome === "SUPPRESSED") { await rememberSuppressedSource(db, gate.suppressionId, source); suppressedCount++; continue; }
        if (gate.outcome === "NO_RAID") { noRaidCount++; continue; }

        if (gate.outcome === "NEW_RAID" && (candidates.length > 0 || suppressions.length > 0)) {
          const semantic = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: `Final same-project registry gate. Decide whether this supported proposal is already represented, matches a PM-rejected suppression, is too uncertain, or is materially distinct. Prefer MERGE_EVIDENCE over NEW_RAID when related with high confidence; use NO_RAID when evidence is insufficient.\nSource: ${JSON.stringify(source)}\nProposal: ${JSON.stringify(gate.analysis)}\nActive candidates: ${JSON.stringify(candidates.map(candidate => ({ id: candidate.id, title: candidate.title, description: candidate.description })))}\nSuppressions: ${JSON.stringify(suppressions.map(suppression => ({ id: suppression.id, normalizedTitle: suppression.normalizedTitle, normalizedRiskFingerprint: suppression.normalizedRiskFingerprint })))}`,
            config: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["NO_RAID", "MERGE_EVIDENCE", "SUPPRESSED", "NEW_RAID"] }, existingRaidId: { type: "STRING" }, suppressionId: { type: "STRING" }, confidence: { type: "NUMBER" }, rationale: { type: "STRING" } }, required: ["action", "confidence", "rationale"] } },
          });
          const semanticDecision = semanticGateSchema.parse(JSON.parse(cleanJson(semantic.text || "{}")));
          if (semanticDecision.action === "SUPPRESSED" && semanticDecision.confidence >= 0.9 && suppressions.some(item => item.id === semanticDecision.suppressionId)) { await rememberSuppressedSource(db, semanticDecision.suppressionId, source); suppressedCount++; continue; }
          if (semanticDecision.action === "MERGE_EVIDENCE" && semanticDecision.confidence >= 0.9 && candidates.some(item => item.id === semanticDecision.existingRaidId)) gate = { outcome: "MERGE_EVIDENCE", candidateId: semanticDecision.existingRaidId!, reason: semanticDecision.rationale };
          else if (semanticDecision.action !== "NEW_RAID" || semanticDecision.confidence < 0.9) { noRaidCount++; continue; }
        }

        const targetDocument = gate.outcome === "MERGE_EVIDENCE" ? candidateDocuments.find(document => document.id === gate.candidateId) : undefined;
        const analysis = proposal.analysis!;
        const outcome = await db.runTransaction(async transaction => {
          const existingSource = await transaction.get(sourceRef);
          if (existingSource.exists) return { kind: "skipped" as const };
          const now = new Date().toISOString();
          const evidence = { sourceKey: source.sourceKey, sourceType: source.sourceType, sourceDocumentId: source.sourceDocumentId, ...(source.parentDocumentId ? { parentDocumentId: source.parentDocumentId } : {}), ...(source.observedAt ? { observedAt: source.observedAt } : {}), addedAt: now };
          if (targetDocument) {
            const targetSnapshot = await transaction.get(targetDocument.ref);
            if (!targetSnapshot.exists || targetSnapshot.data()?.archived === true || CLOSED_RAID_STATUSES.has(normalizeRiskText(targetSnapshot.data()?.status))) throw new Error("Selected canonical RAID record is no longer active; source was not written.");
            const data = targetSnapshot.data()!;
            transaction.update(targetDocument.ref, { sourceKey: data.sourceKey || source.sourceKey, sourceKeys: [...new Set([...(data.sourceKeys || (data.sourceKey ? [data.sourceKey] : [])), source.sourceKey])], sourceReferences: [...(data.sourceReferences || []), evidence], lastDetectedAt: now, detectionCount: Number(data.detectionCount || 1) + 1, auditTrail: [...(data.auditTrail || []), { action: "EVIDENCE_MERGED", sourceKey: source.sourceKey, at: now }], mergeStatus: "CANONICAL" });
            transaction.set(sourceRef, { projectId: source.projectId, sourceKey: source.sourceKey, sourceKeys: [source.sourceKey], sourceReferences: [evidence], mergeStatus: "MERGED", mergedIntoRaidId: targetDocument.id, mergedIntoRaidNumber: data.raidNumber || null, mergedAt: now, status: "Merged", createdAt: now });
            return { kind: "merged" as const, canonicalRaidId: typeof data.raidNumber === "string" ? data.raidNumber : null, canonicalDocumentId: targetDocument.id, projectId: String(data.projectId || source.projectId) };
          }
          const counterRef = db.collection("counters").doc("raid_records");
          const counterSnapshot = await transaction.get(counterRef);
          let lastSequence = Number(counterSnapshot.data()?.lastSequence || 1000);
          if (!counterSnapshot.exists) {
            const latestNumbered = await transaction.get(db.collection("raid_matrix").orderBy("raidSequence", "desc").limit(1));
            lastSequence = Number(latestNumbered.docs[0]?.data().raidSequence || 1000);
          }
          const raidSequence = nextRaidSequence(lastSequence);
          const raidNumber = formatRaidNumber(raidSequence);
          const assignedOwner = ["Dependency", "Issue"].includes(analysis.classification) ? "IT Consultant" : "ORAT Team";
          const textPool = [analysis.title, analysis.description, analysis.classification, source.projectId].join(" ").toLowerCase();
          transaction.set(counterRef, { kind: "raid_business_number", lastSequence: raidSequence, updatedAt: now }, { merge: true });
          transaction.set(sourceRef, { ...analysis, raidNumber, raidSequence, numberingVersion: 1, projectId: source.projectId, projectName: projectNames.get(source.projectId) || source.projectId, sourceReferenceId: source.sourceDocumentId, sourceType: source.sourceType, sourceKey: source.sourceKey, sourceKeys: [source.sourceKey], sourceReferences: [evidence], roamCategory: "New / Unassigned", impactLevel: analysis.importance, status: "Identified", assignedOwner, isItOwned: assignedOwner === "IT Consultant", dispositionNotes: "", historicalComments: [], auditTrail: [{ action: "RISK_CREATED", sourceKey: source.sourceKey, raidNumber, at: now, confidence: proposal.confidence, rationale: proposal.rationale }], detectionCount: 1, lastDetectedAt: now, mergeStatus: "CANONICAL", analyzedAt: now, createdAt: now, search_tags: [...new Set(textPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(word => word.length > 1))] });
          return { kind: "created" as const, raidId: raidNumber, projectId: source.projectId, projectName: projectNames.get(source.projectId) || source.projectId, probability: analysis.probability };
        });
        if (outcome.kind === "created") { createdCount++; createdRecords.push({ raidId: outcome.raidId, projectId: outcome.projectId, projectName: outcome.projectName, probability: outcome.probability }); }
        else if (outcome.kind === "merged") { mergedCount++; mergedRecords.push({ canonicalRaidId: outcome.canonicalRaidId, canonicalDocumentId: outcome.canonicalDocumentId, projectId: outcome.projectId }); }
        else skippedCount++;
      } catch (error: any) {
        errorCount++;
        errorRecords.push({ sourceKey: source.sourceKey, error: error.message || "Unknown ingestion error." });
      } finally {
        if (lease) await releaseProjectLease(db, lease);
      }
    }

    const counterSnapshot = await db.collection("counters").doc("raid_records").get();
    return NextResponse.json({ success: errorCount === 0, processedCount: sources.length, createdCount, mergedCount, suppressedCount, noRaidCount, skippedCount, errorCount, createdRecords, mergedRecords, errorRecords, counterValue: Number(counterSnapshot.data()?.lastSequence || 0) });
  } catch (error: any) {
    console.error("RAID Pipeline Error:", error);
    return NextResponse.json({ error: error.message, errorCount: 1 }, { status: error instanceof ProjectIngestionBusyError ? 409 : 500 });
  }
}

// File: src/app/api/analyze-raid/route.ts

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export async function POST() {
  try {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    if (getApps().length === 0) {
      if (!clientEmail || !privateKey || !projectId) {
        throw new Error("Missing critical Firebase Admin environment variables at runtime.");
      }
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    }

    const adminDb = getFirestore();
    const ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY 
    });

    // 1. Fetch system instructions prompt blueprint
    const configSnap = await adminDb.collection("admin_settings").doc("risk_profile").get();
    const systemInstructionOverride = configSnap.exists 
      ? configSnap.data()?.riskPrompt 
      : "You are an expert airport systems construction risk analyzer.";

    // 2. Dual-Source Aggregation Queries (Triggered concurrently)
    const [journalSnapshot, fieldSnapshot] = await Promise.all([
      // Source A: Project Journal entries
      adminDb.collectionGroup("entries").limit(15).get(),
      // Source B: Field Observations specifically categorized as Risk
      adminDb.collectionGroup("sub_observations")
        .where("observationType", "==", "Risk")
        .limit(15)
        .get()
    ]);

    const itemsToProcess: string[] = [];

    // Parse Source A: Project Journals (Mapping the "text" field)
    journalSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.text) {
        itemsToProcess.push(`[ID: ${doc.id}][Source: Project Journal] Entry: ${data.text}`);
      }
    });

    // Parse Source B: Field Observations (Mapping the "description" field)
    fieldSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.description) {
        itemsToProcess.push(`[ID: ${doc.id}][Source: Field Observation] Description: ${data.description}`);
      }
    });

    // Exit early if both repositories are completely dehydrated
    if (itemsToProcess.length === 0) {
      return NextResponse.json({ message: "No new journal logs or field observations found to process." });
    }

    const textToAnalyze = itemsToProcess.join("\n\n");

    // 3. Dispatch unified raw payload data stream directly to Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze these construction logs from multiple sources and extract structured RAID matrix items:\n\n${textToAnalyze}`,
      config: {
        systemInstruction: systemInstructionOverride,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  sourceReferenceId: { type: "STRING" },
                  sourceType: { type: "STRING", enum: ["Project Journal", "Field Observation"] },
                  classification: { type: "STRING", enum: ["Risk", "Assumption", "Issue", "Dependency"] },
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  impactLevel: { type: "STRING", enum: ["Low", "Medium", "High"] },
                },
                required: ["sourceReferenceId", "sourceType", "classification", "title", "description", "impactLevel"],
              },
            },
          },
        },
      },
    });

    const jsonText = response.text || "{\"items\":[]}";
    const { items } = JSON.parse(jsonText);

    // 4. Batch transaction commit block to the central matrix database
    const batch = adminDb.batch();
    
    for (const item of items) {
      const raidRef = adminDb.collection("raid_matrix").doc();
      const assignedOwner = item.classification === "Dependency" || item.classification === "Issue" 
        ? "IT Consultant" 
        : "ORAT Team";
      const isItOwned = assignedOwner === "IT Consultant";

      batch.set(raidRef, {
        ...item,
        status: "Identified",
        assignedOwner,
        isItOwned,
        dispositionNotes: "",
        historicalComments: [],
        sourceContextLink: item.sourceType === "Project Journal" 
          ? "PM Daily Log / Workbench Tracker" 
          : "Div 27 / Cable Pathways Submittal", 
        analyzedAt: new Date().toISOString(),
      });
    }
    
    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      processedCount: items ? items.length : 0 
    });

  } catch (error: any) {
    console.error("RAID Pipeline Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
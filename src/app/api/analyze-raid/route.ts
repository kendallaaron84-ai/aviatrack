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

    const configSnap = await adminDb.collection("admin_settings").doc("risk_profile").get();
    const systemInstructionOverride = configSnap.exists 
      ? configSnap.data()?.riskPrompt 
      : "You are an expert airport systems construction risk analyzer.";

    // Fetch up to 25 items from each source concurrently
    const [journalSnapshot, fieldSnapshot] = await Promise.all([
      adminDb.collectionGroup("entries").limit(25).get(),
      adminDb.collectionGroup("sub_observations")
        .where("observationType", "==", "Risk")
        .limit(25).get()
    ]);

    const itemsToProcess: string[] = [];

    // Source A: Extract from Project Journal logs
    journalSnapshot.forEach((doc) => {
      const data = doc.data();
      // Back-trace the project ID from the path: /project_journals/{projectId}/entries/{docId}
      const pathSegments = doc.ref.path.split("/");
      const inferredProjectId = pathSegments[1] || "Global";

      if (data.text) {
        itemsToProcess.push(`[ID: ${doc.id}][Project: ${inferredProjectId}][Source: Project Journal] Text: ${data.text}`);
      }
    });

    // Source B: Extract from Field Observations dropdown selections
    fieldSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.description) {
        itemsToProcess.push(`[ID: ${doc.id}][Project: Global][Source: Field Observation] Description: ${data.description}`);
      }
    });

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ message: "No new data pool blocks found to parse." });
    }

    const textToAnalyze = itemsToProcess.join("\n\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze these construction updates and map them out into structured matrix items. Extrapolate reasonable probability integers (1-4) and importance categories based on context:\n\n${textToAnalyze}`,
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
                  projectId: { type: "STRING" },
                  sourceType: { type: "STRING", enum: ["Project Journal", "Field Observation"] },
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  roamCategory: { type: "STRING", enum: ["Risk", "Assumption", "Issue", "Dependency"] },
                  importance: { type: "STRING", enum: ["Critical", "Mandatory", "High", "Medium", "Low"] },
                  probability: { type: "INTEGER", description: "Likelihood weight score rating from 1 to 4" }
                },
                required: ["sourceReferenceId", "projectId", "sourceType", "title", "description", "roamCategory", "importance", "probability"],
              },
            },
          },
        },
      },
    });

    const jsonText = response.text || "{\"items\":[]}";
    const { items } = JSON.parse(jsonText);

    const batch = adminDb.batch();
    
    for (const item of items) {
      const raidRef = adminDb.collection("raid_matrix").doc();
      const assignedOwner = item.roamCategory === "Dependency" || item.roamCategory === "Issue" 
        ? "IT Consultant" 
        : "ORAT Team";

      batch.set(raidRef, {
        ...item,
        status: "Identified",
        assignedOwner,
        isItOwned: assignedOwner === "IT Consultant",
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
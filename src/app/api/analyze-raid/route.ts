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
    
    // 🔐 Clean private key of any hidden enclosing string formatting from environments
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!clientEmail || !privateKey || !projectId) {
      return NextResponse.json({ 
        error: "Missing critical Firebase Admin environment variables at runtime." 
      }, { status: 400 });
    }

    if (!geminiApiKey) {
      return NextResponse.json({
        error: "Missing critical Gemini API Key."
      }, { status: 400 });
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    }

    const adminDb = getFirestore();
    const ai = new GoogleGenAI({ 
      apiKey: geminiApiKey 
    });

    const configSnap = await adminDb.collection("admin_settings").doc("risk_profile").get();
    const systemInstructionOverride = configSnap.exists 
      ? configSnap.data()?.riskPrompt 
      : "You are an expert infrastructure construction systems risk evaluator.";

    // Fetch up to 25 items from each source concurrently
    const [journalSnapshot, fieldSnapshot] = await Promise.all([
      adminDb.collectionGroup("entries").limit(25).get(),
      adminDb.collectionGroup("sub_observations")
        .where("observationType", "==", "Risk")
        .limit(25).get()
    ]);

    const itemsToProcess: string[] = [];

    // Source A: Extract from Project Journal logs (/project_journals/{projectId}/entries/{docId})
    journalSnapshot.forEach((doc) => {
      const data = doc.data();
      const pathSegments = doc.ref.path.split("/");
      const inferredProjectId = pathSegments[1] || "Global Context";

      if (data.text) {
        itemsToProcess.push(`[ID: ${doc.id}][Project: ${inferredProjectId}][Source: Project Journal] Text: ${data.text}`);
      }
    });

    // Source B: Extract from nested field observation sub-collections (/field_observations/{obsId}/sub_observations/{subId})
    fieldSnapshot.forEach((doc) => {
      const data = doc.data();
      const pathSegments = doc.ref.path.split("/");
      const parentObservationId = pathSegments[1] || "Global";

      if (data.description) {
        itemsToProcess.push(`[ID: ${doc.id}][ParentObs: ${parentObservationId}][Source: Field Observation] Description: ${data.description}`);
      }
    });

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ message: "No active text logs or risk updates found to evaluate." });
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
                  classification: { type: "STRING", enum: ["Risk", "Assumption", "Issue", "Dependency"] },
                  importance: { type: "STRING", enum: ["Critical", "Mandatory", "High", "Medium", "Low"] },
                  probability: { type: "INTEGER", description: "Likelihood weight score rating from 1 to 4" }
                },
                required: ["sourceReferenceId", "projectId", "sourceType", "title", "description", "classification", "importance", "probability"],
              },
            },
          },
        },
      },
    });

    let jsonText = response.text || "{\"items\":[]}";
    
    // 🛡️ GLITCH-PROOF STRING CLEANING: Strips Markdown blocks safely using standard string slicing instead of regular expressions
    jsonText = jsonText.trim();
    if (jsonText.startsWith("```")) {
      const firstLineBreak = jsonText.indexOf("\n");
      if (firstLineBreak !== -1) {
        jsonText = jsonText.substring(firstLineBreak + 1);
      } else {
        jsonText = jsonText.substring(3);
      }
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.substring(0, jsonText.length - 3);
    }
    jsonText = jsonText.trim();

    const { items } = JSON.parse(jsonText);

    const batch = adminDb.batch();
    
    for (const item of items) {
      const raidRef = adminDb.collection("raid_matrix").doc();
      const assignedOwner = item.classification === "Dependency" || item.classification === "Issue" 
        ? "IT Consultant" 
        : "ORAT Team";

      const rawProb = parseInt(item.probability);
      const parsedProbability = isNaN(rawProb) ? 2 : Math.max(1, Math.min(4, rawProb));
      const importanceVal = item.importance || "Medium";

      const title = item.title || "";
      const description = item.description || "";
      const classification = item.classification || "Risk";
      const roamCategory = classification;
      const projectId = item.projectId || "Global";
      const status = "Identified";

      const textPool = [title, description, classification, roamCategory, status, projectId].join(" ").toLowerCase();
      const search_tags = Array.from(new Set(textPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(w => w.length > 1)));

      batch.set(raidRef, {
        sourceReferenceId: item.sourceReferenceId || "",
        projectId,
        sourceType: item.sourceType || "Field Observation",
        title,
        description,
        classification,
        roamCategory,
        importance: importanceVal,
        impactLevel: importanceVal, // populate both keys for cross-layout support
        probability: parsedProbability,
        status,
        assignedOwner,
        isItOwned: assignedOwner === "IT Consultant",
        dispositionNotes: "",
        historicalComments: [],
        sourceContextLink: item.sourceType === "Project Journal" 
          ? "PM Daily Log / Workbench Tracker" 
          : "Field Site Inspection Update", 
        analyzedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        search_tags
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
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
    
    // 🔐 BULLETPROOF KEY SANITIZATION: Removes ghost edge-case quotes and forces newline evaluation
    const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const privateKey = rawPrivateKey
      ? rawPrivateKey.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, '\n')
      : undefined;

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // Handle empty environments / missing configurations gracefully
    if (!clientEmail || !privateKey || !projectId) {
      return NextResponse.json({ 
        error: "Missing critical Firebase Admin environment variables at runtime. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and NEXT_PUBLIC_FIREBASE_PROJECT_ID." 
      }, { status: 400 });
    }

    if (!geminiApiKey) {
      return NextResponse.json({
        error: "Missing critical Gemini API Key. Please configure GEMINI_API_KEY or GOOGLE_API_KEY."
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

    // Source B: Extract from Field Observations dropdown selections with concurrent parent project resolution
    const parentRefsMap = new Map<string, any>();
    fieldSnapshot.forEach((doc) => {
      const parentRef = doc.ref.parent.parent;
      if (parentRef) {
        parentRefsMap.set(parentRef.id, parentRef);
      }
    });

    const parentSnaps = parentRefsMap.size > 0 
      ? await Promise.all(Array.from(parentRefsMap.values()).map((ref: any) => ref.get()))
      : [];

    const parentDataMap = new Map<string, any>();
    parentSnaps.forEach((snap: any) => {
      if (snap.exists) {
        parentDataMap.set(snap.id, snap.data());
      }
    });

    fieldSnapshot.forEach((doc) => {
      const data = doc.data();
      const parentRef = doc.ref.parent.parent;
      const parentData = parentRef ? parentDataMap.get(parentRef.id) : null;
      const inferredProjectId = parentData?.projectId || "Global";

      if (data.description) {
        itemsToProcess.push(`[ID: ${doc.id}][Project: ${inferredProjectId}][Source: Field Observation] Description: ${data.description}`);
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
    
    // Clean up potential markdown formatting block backticks around AI JSON responses before parsing safely
    jsonText = jsonText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^
http://googleusercontent.com/immersive_entry_chip/0
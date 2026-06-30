// File: src/app/api/analyze-raid/route.ts

// 🟢 FORCE DYNAMIC TO BYPASS BUILD-TIME EVALUATION
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai"; // Standard Google AI SDK
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export async function POST() {
  try {
    // 🔐 ENCAPSULATION SAFEGUARD: Move variable extraction completely inside the request runtime context
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    // Graceful initialization wrapped securely inside the runtime execution stack
    if (getApps().length === 0) {
      if (!clientEmail || !privateKey || !projectId) {
        throw new Error("Missing critical Firebase Admin environment variables at runtime.");
      }
      
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("🚀 Firebase Admin successfully initialized at runtime.");
    }

    // Initialize services safely now that authentication is guaranteed
    const adminDb = getFirestore();
    
    // Explicitly pass configuration context to prevent empty environment auto-detection crashes
    const ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY 
    });

    // 1. Fetch your dynamic instruction override text from Firestore
    const configSnap = await adminDb.collection("admin_settings").doc("risk_profile").get();
    const systemInstructionOverride = configSnap.exists 
      ? configSnap.data()?.riskPrompt 
      : "You are an expert airport systems construction risk analyzer.";

    // 2. Pull the material (e.g., Sub-Observations with type "Risk")
    const snapshot = await adminDb.collectionGroup("sub_observations")
      .where("observationType", "==", "Risk")
      .limit(10) // Chunk batch processing
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ message: "No new risk observations found to process." });
    }

    // Accumulate your field notes into a processing payload
    const textToAnalyze = snapshot.docs.map(d => {
      const data = d.data();
      return `[ID: ${d.id}] Description: ${data.description}`;
    }).join("\n");

    // 3. Invoke Gemini using the saved prompt text as the core instruction directive
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze these field notes and extract structured RAID items:\n\n${textToAnalyze}`,
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
                  classification: { type: "STRING", enum: ["Risk", "Assumption", "Issue", "Dependency"] },
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  impactLevel: { type: "STRING", enum: ["Low", "Medium", "High"] },
                },
                required: ["sourceReferenceId", "classification", "title", "description", "impactLevel"],
              },
            },
          },
        },
      },
    });

    const jsonText = response.text || "{\"items\":[]}";
    const { items } = JSON.parse(jsonText);

    // 4. Write back structured entries directly to your unified RAID matrix database
    const batch = adminDb.batch();
    
    for (const item of items) {
      const raidRef = adminDb.collection("raid_matrix").doc();
      
      // Define if the item falls within the technical scope of the IT Consultant
      const assignedOwner = item.classification === "Dependency" || item.classification === "Issue" 
        ? "IT Consultant" 
        : "ORAT Team";
        
      const isItOwned = assignedOwner === "IT Consultant";

      batch.set(raidRef, {
        ...item,
        status: "Identified",
        assignedOwner: assignedOwner,
        isItOwned: isItOwned, // 🏢 Controls the Consultant working view vs Leadership view filter logic
        dispositionNotes: "",
        historicalComments: [],
        
        // 🔗 Traceability Link Hooks
        sourceType: "Field Report", 
        sourceReferenceId: item.sourceReferenceId || "", // Automatically carries over the Firestore Parent Document ID
        sourceContextLink: "Div 27 / Cable Pathways Submittal", // Structural link mapping rule default
        analyzedAt: new Date().toISOString(),
      });
    }
    
    await batch.commit();

    // 🟢 Clean top-level function return
    return NextResponse.json({ 
      success: true, 
      processedCount: items ? items.length : 0 
    });

  } catch (error: any) {
    console.error("RAID Pipeline Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
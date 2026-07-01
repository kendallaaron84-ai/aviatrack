// File: src/app/api/generate-report/route.ts

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";

export async function POST(request: Request) {
  try {
    const { reportType, projectId, dateRange, options } = await request.json();
    
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const fbProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    // Clean environment strings for certificate loading
    const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const privateKey = rawPrivateKey
      ? rawPrivateKey.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, '\n')
      : undefined;

    if (getApps().length === 0) {
      if (!clientEmail || !privateKey || !fbProjectId) {
        return NextResponse.json({ error: "Missing critical environment configurations." }, { status: 400 });
      }
      initializeApp({
        credential: cert({ projectId: fbProjectId, clientEmail, privateKey }),
      });
    }

    const db = getFirestore();
    
    // Fetch active registry matrices
    const raidSnapshot = await db.collection("raid_matrix").get();
    const raidItems = raidSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const projectSnapshot = projectId && projectId !== "all" 
      ? await db.collection("projects").doc(projectId).get()
      : null;
    const projectData = projectSnapshot?.exists ? projectSnapshot.data() : null;
    const projectName = projectData?.name || "All Projects Portfolio";

    // Build assessment report content block
    let reportText = `=========================================\n`;
    reportText += `       PROGRAM ASSESSMENT STATUS REPORT   \n`;
    reportText += `=========================================\n\n`;
    reportText += `Report Type: ${reportType || "Status Summary"}\n`;
    reportText += `Target Scope: ${projectName}\n`;
    reportText += `Generated At: ${new Date().toLocaleString()}\n`;
    reportText += `-----------------------------------------\n\n`;

    reportText += `[Metrics Summary]\n`;
    const counts = { Risk: 0, Assumption: 0, Issue: 0, Dependency: 0 };
    raidItems.forEach((item: any) => {
      const cls = item.classification;
      if (cls in counts) {
        counts[cls as keyof typeof counts]++;
      }
    });

    reportText += `- Active Risks: ${counts.Risk}\n`;
    reportText += `- Active Assumptions: ${counts.Assumption}\n`;
    reportText += `- Active Issues: ${counts.Issue}\n`;
    reportText += `- Active Dependencies: ${counts.Dependency}\n`;
    reportText += `\nDetailed RAID Matrices:\n`;

    raidItems.forEach((item: any, idx: number) => {
      reportText += `${idx + 1}. [${item.classification}] ${item.title} (Owner: ${item.assignedOwner || "Unassigned"})\n`;
      reportText += `   Description: ${item.description || "No description provided."}\n`;
      reportText += `   Probability Score: ${item.probability || "N/A"} | Importance: ${item.importance || "N/A"}\n\n`;
    });

    // Clean scrubbing: Removed all literal text references and hyper-links to AviaTrack/AviaITrack completely.
    reportText += `-----------------------------------------\n`;
    reportText += `End of Program Assessment Status Report\n`;
    reportText += `=========================================\n`;

    return NextResponse.json({
      success: true,
      reportText,
      projectName
    });
  } catch (error: any) {
    console.error("Report Generation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
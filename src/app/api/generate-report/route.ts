// File: src/app/api/generate-report/route.ts

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { z } from "zod";

const generateReportRequestSchema = z.object({
  reportType: z.string().trim().min(1).max(100).optional(),
  projectId: z.string().trim().min(1).max(128).optional(),
  dateRange: z.object({
    start: z.string().trim().max(40).optional(),
    end: z.string().trim().max(40).optional(),
  }).strict().optional(),
  options: z.record(z.unknown()).optional(),
  journalEntries: z.array(z.unknown()).max(500).optional(),
  reportingPeriod: z.string().trim().max(200).optional(),
}).strict();

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = getFirebaseAdmin();
    await admin.auth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let requestPayload: unknown;
    try {
      requestPayload = await request.json();
    } catch {
      return NextResponse.json({
        error: "Bad Request",
        details: { formErrors: ["Request body must contain valid JSON."], fieldErrors: {} },
      }, { status: 400 });
    }

    const validation = generateReportRequestSchema.safeParse(requestPayload);
    if (!validation.success) {
      return NextResponse.json({
        error: "Bad Request",
        details: validation.error.flatten(),
      }, { status: 400 });
    }

    const { reportType, projectId } = validation.data;
    const db = admin.db;
    
    // Fetch active registry matrices
    const raidSnapshot = await db.collection("raid_matrix").get();
    const raidItems = raidSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((item: any) => item.mergeStatus !== "MERGED")
      .filter((item: any) => !projectId || projectId === "all" || item.projectId === projectId);

    const projectDocs = await db.collection("admin_projects").get();
    const projectNames = new Map(projectDocs.docs.map(doc => [doc.id, doc.data().name || doc.data().projectName || doc.id]));

    const projectSnapshot = projectId && projectId !== "all" 
      ? await db.collection("admin_projects").doc(projectId).get()
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
      reportText += `   Project ID: ${item.projectId || "Unassigned"} | Project Name: ${item.projectName || projectNames.get(item.projectId) || "Unnamed Project"}\n`;
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

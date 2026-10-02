export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "genkit";
import { ai } from "@/ai/genkit";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

const journalEntrySchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  timestamp: z.string().max(100).optional(),
  loggedBy: z.string().max(320).optional(),
}).passthrough();

const generateReportRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  journalEntries: z.array(journalEntrySchema).min(1).max(500),
  reportingPeriod: z.string().trim().min(1).max(200),
}).strict();

const reportDraftSchema = z.object({
  lookAhead: z.string().describe("Concise three-week look-ahead grounded only in the journal entries."),
  risks: z.string().describe("Specific current risks found in the journal entries, or 'No material risk identified.'"),
  impact: z.string().describe("Supported schedule, cost, scope, or operational impacts without fabrication."),
  resolutionPlan: z.string().describe("Specific mitigation or resolution steps supported by the journal entries."),
  actionItems: z.array(z.string()).describe("Concrete follow-up actions supported by the journal entries."),
});

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getFirebaseAdmin();
  try {
    await admin.auth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = generateReportRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad Request", details: parsed.error.flatten() }, { status: 400 });
    }

    const journalText = parsed.data.journalEntries
      .map(entry => `[${entry.timestamp || "Date unavailable"}] ${entry.text}`)
      .join("\n\n");
    const { output } = await ai.generate({
      system: [
        "You prepare concise construction-program status report drafts for a Program Manager.",
        "Use only the supplied journal evidence. Do not invent dates, commitments, risks, impacts, owners, or mitigations.",
        "Treat observations explicitly described as non-risks as context, not as risks.",
        "Return a practical draft for human review, not a final certification.",
      ].join(" "),
      prompt: `Project ID: ${parsed.data.projectId}\nReporting period: ${parsed.data.reportingPeriod}\n\nJournal entries:\n${journalText}`,
      output: { schema: reportDraftSchema },
    });
    if (!output) throw new Error("Gemini returned no structured report draft.");

    return NextResponse.json({
      projectSummaries: [{ projectId: parsed.data.projectId, ...output }],
    });
  } catch (error: any) {
    console.error("Status report auto-draft failed:", error);
    return NextResponse.json({ error: error.message || "Status report auto-draft failed." }, { status: 500 });
  }
}

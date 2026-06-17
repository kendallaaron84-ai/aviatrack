import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google AI SDK with a secure server-side environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { journalEntries, reportingPeriod } = await req.json();

    if (!journalEntries || journalEntries.length === 0) {
      return NextResponse.json({ error: "No journal entries provided for this period." }, { status: 400 });
    }

    // Combine all raw journal logs into a single text block for the AI to read
    const combinedLogs = journalEntries.map((log: any) => 
      `[${log.timestamp} - ${log.projectID}]: ${log.text}`
    ).join('\n');

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    // The System Prompt: This is the secret to forcing a clean, executive format
    const prompt = `
      You are a Senior IT Portfolio Director. I am providing you with a chronological list of raw project manager journal entries for the period of ${reportingPeriod}.
      
      Your task is to analyze these logs and generate a structured executive summary. 
      You MUST return the data strictly as a JSON object matching this exact structure, with no markdown formatting or conversational text outside the JSON:
      
      {
        "consolidatedRisksAndResolutions": [
          "Macro risk 1 and resolution summary",
          "Macro risk 2 and resolution summary"
        ],
        "projectSummaries": [
          {
            "projectId": "Project Identifier",
            "lookAhead": "Summarized 3-week look ahead based on recent trajectory.",
            "risks": "Specific risks identified in logs.",
            "impact": "Potential impact to schedule or budget.",
            "resolutionPlan": "The mitigation steps being taken.",
            "actionItems": ["Action 1", "Action 2"]
          }
        ]
      }

      Raw Journal Logs to Analyze:
      ${combinedLogs}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Clean the response to ensure it's pure JSON
    const jsonString = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const parsedData = JSON.parse(jsonString);

    return NextResponse.json(parsedData);

  } catch (error) {
    console.error("AI Generation Failed:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
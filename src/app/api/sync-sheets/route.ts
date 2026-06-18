import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const record = body.record ? body.record : body;

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Sheets sync is not configured properly.',
        },
        { status: 503 },
      );
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 🟢 RESOLVE IMAGES FROM MULTIPLE POTENTIAL FRONTEND STORAGE KEYS
    // This catches array items, attachment objects, or direct URL strings
    let resolvedImageUrl = record.imageUrl ?? '';
    let resolvedImageName = record.imageName ?? '';

    if (Array.isArray(record.attachments) && record.attachments.length > 0) {
      resolvedImageUrl = record.attachments[0].url || record.attachments[0];
      resolvedImageName = record.attachments[0].name || 'Attached_Image';
    } else if (Array.isArray(record.images) && record.images.length > 0) {
      resolvedImageUrl = record.images[0];
      resolvedImageName = 'Uploaded_Observation_Image';
    }

    // 🟢 BASE FALLBACK CONVENTIONS
    const targetId = record.id ?? body.id ?? '';
    const targetStage = record.stage ?? record.workStage ?? 'Construction';
    const targetReportNo = record.reportNo ?? record.forReportNo ?? '';
    const targetUser = record.submittedBy ?? record.loggedBy ?? record.author ?? 'ITSD Support';
    
    const rawDate = record.submittedAt ?? record.observationDate ?? record.timestamp ?? '';
    const targetDate = rawDate.includes('T') ? rawDate.split('T')[0] : (rawDate.includes(',') ? rawDate.split(',')[0] : rawDate);
    const targetTime = record.startTime ?? record.time ?? '';
    
    const targetProgram = record.programName ?? record.program ?? '';
    const targetProject = record.projectName ?? record.project ?? '';
    const targetPercent = record.percentComplete ?? record.percent ?? '';
    const targetLocation = record.location ?? '';
    const targetLevel = record.buildingLevel ?? record.level ?? '';
    const targetWeather = record.weather ?? '';
    const targetDegrees = record.degreesF ?? record.temperature ?? '';
    const targetSiteStaff = record.presentAtSite ?? record.attendees ?? '';
    const targetType = record.observationType || record.resolutionType || 'General';
    const targetReason = record.changeReason ?? '';
    const targetPriority = record.priority ?? 'Medium';
    const targetStatus = record.status ?? 'New';
    
    const targetActionType = record.pmActionType ?? '';
    const targetChangeStatus = record.changeStatus ?? '';
    const primaryComments = record.comment || '';
    const closeoutNotes = record.pmComments || record.closeoutNotes || primaryComments;
    const closeoutDate = record.riskCloseoutDate || new Date().toLocaleDateString();

    // 🟢 MULTI-ENTRY PARSING LOGIC FOR COLUMN R
    // Extracts individual entry logs if they exist, otherwise defaults to the root description text
    let entriesToLog: string[] = [];
    if (Array.isArray(record.entries) && record.entries.length > 0) {
      entriesToLog = record.entries.map((e: any) => typeof e === 'object' ? (e.notes || e.description || '') : e);
    } else if (Array.isArray(record.lineItems) && record.lineItems.length > 0) {
      entriesToLog = record.lineItems.map((item: any) => item.notes || item.description || '');
    } else {
      entriesToLog = [record.description ?? 'No description entered'];
    }

    // Array to compile all generated row packets
    const rowsToAppend = entriesToLog.map((individualDescription) => {
      return [
        targetId,             // Observation_ID (Col A)
        targetStage,          // Stage (Col B)
        targetReportNo,       // FOR_Report_No (Col C)
        targetUser,           // Submitted_By (Col D)
        targetDate,           // Observation_Date (Col E)
        targetTime,           // Start_Time (Col F)
        targetProgram,        // Program_Name (Col G)
        targetProject,        // Project_Name (Col H)
        targetPercent,        // Percent_Complete (Col I)
        targetLocation,       // Location (Col J)
        targetLevel,          // Building_Level (Col K)
        targetWeather,        // Weather (Col L)
        targetDegrees,        // Degrees_F (Col M)
        targetSiteStaff,      // Present_at_Site (Col N)
        targetType,           // Observation_Type (Col O)
        targetReason,         // Change_Reason (Col P)
        targetPriority,       // Priority (Col Q)
        individualDescription,// Description (Col R) -> 🟢 Pushes unique row per entry
        targetStatus,         // Status (Col S)
        targetActionType,     // PM_Action_Type (Col T)
        targetChangeStatus,   // Change_Status (Col U)
        primaryComments,      // PM_Comments (Col V)
        resolvedImageUrl,     // Image_URL (Col W) -> 🟢 Safe mapping injection
        resolvedImageName,    // Image_Name (Col X) -> 🟢 Safe mapping injection
        record.aiRiskAnalysis ?? '', // AI_Risk_Analysis (Col Y)
        new Date().toLocaleString(), // Timestamp (Col Z)
        closeoutNotes,        // Risk_Closeout_Notes (Col AA)
        closeoutDate          // Risk_Closeout_Date (Col AB)
      ];
    });

    // Bulk append all parsed observation rows to your Google Sheet tab in a single transactional request
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Google FOR'!A:AB", 
      valueInputOption: 'USER_ENTERED',
      requestBody: { 
        values: rowsToAppend 
      },
    });

    return NextResponse.json({ ok: true, message: `Successfully synchronized ${rowsToAppend.length} row(s) to Sheets.` });
  } catch (error) {
    console.error('Sheet sync route error', error);
    return NextResponse.json(
      { ok: false, message: 'Unable to sync the sheet entry.' },
      { status: 500 },
    );
  }
}
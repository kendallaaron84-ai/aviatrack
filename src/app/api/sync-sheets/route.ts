import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Normalize whether it receives a nested { record } block or a flat object
    const record = body.record ? body.record : body;

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Sheets sync is not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
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

    // Extract basic observation details
    const targetId = record.id ?? '';
    const targetLocation = record.location ?? '';
    const targetDescription = record.description ?? '';
    const targetStatus = record.status ?? 'New';
    const targetType = record.observationType || record.resolutionType || 'General';
    const primaryComments = record.comment || '';

    // Extract resolution notes from the dashboard transmittal form state
    const closeoutNotes = record.pmComments || record.closeoutNotes || primaryComments;
    const closeoutDate = record.riskCloseoutDate || new Date().toLocaleDateString();

    // Full 28-column row mapping matching your live CSV schema exactly 
    const row = [
      targetId,                                                    // Observation_ID
      record.stage ?? 'Construction',                              // Stage
      record.reportNo ?? '',                                       // FOR_Report_No
      record.submittedBy ?? '',                                    // Submitted_By
      record.submittedAt ? record.submittedAt.split('T')[0] : '',  // Observation_Date
      record.startTime ?? '',                                      // Start_Time
      record.programName ?? record.program ?? '',                  // Program_Name
      record.projectName ?? '',                                    // Project_Name
      record.percentComplete ?? '',                                // Percent_Complete
      targetLocation,                                              // Location
      record.buildingLevel ?? '',                                  // Building_Level
      record.weather ?? '',                                        // Weather
      record.degreesF ?? '',                                       // Degrees_F
      record.presentAtSite ?? '',                                  // Present_at_Site
      targetType,                                                  // Observation_Type
      record.changeReason ?? '',                                   // Change_Reason
      record.priority ?? '',                                       // Priority
      targetDescription,                                           // Description
      targetStatus,                                                // Status
      record.pmActionType ?? '',                                   // PM_Action_Type
      record.changeStatus ?? '',                                   // Change_Status
      primaryComments,                                             // PM_Comments
      record.imageUrl ?? '',                                       // Image_URL
      record.imageName ?? '',                                      // Image_Name
      record.aiRiskAnalysis ?? '',                                 // AI_Risk_Analysis
      record.timestamp ?? new Date().toLocaleString(),             // Timestamp
      closeoutNotes,                                               // Risk_Closeout_Notes (Column AA)
      closeoutDate                                                 // Risk_Closeout_Date (Column AB)
    ];

    // Aligned precisely to your active sheet tab name 
    // 🟢 Wrap the space-separated tab name in single quotes inside the string query
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Google FOR'!A:AB", 
      valueInputOption: 'USER_ENTERED',
      requestBody: { 
        values: [row] 
      },
    });

    return NextResponse.json({ ok: true, message: 'Observation transaction synced to Sheets.' });
  } catch (error) {
    console.error('Sheet sync route error', error);
    return NextResponse.json(
      { ok: false, message: 'Unable to sync the sheet entry.' },
      { status: 500 },
    );
  }
}
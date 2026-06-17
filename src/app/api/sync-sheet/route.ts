// File: src/app/api/sync-sheets/route.ts
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // 🟢 SAFELY RECONCILE THE PAYLOAD LAYER
    // Automatically normalizes whether it receives a nested { record } block or a flat object
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

    // 🟢 TRANSLATE PM REVIEW KEY ENTRIES TO OPERATIONAL SPECS NATIVELY
    const targetId = record.id ?? '';
    const targetLocation = record.location ?? '';
    const targetDescription = record.description ?? '';
    const targetStatus = record.status ?? 'New';
    
    // Map your custom form values safely to existing layout targets
    const targetType = record.observationType || record.resolutionType || '';
    const targetComments = record.pmComments || record.comment || '';

    // Precise 26-column row mapping matching your operational layout exactly
    const row = [
      targetId,                                            // Observation_ID
      record.stage ?? 'Construction',                      // Stage
      record.reportNo ?? '',                               // FOR_Report_No
      record.submittedBy ?? '',                            // Submitted_By
      record.submittedAt ? record.submittedAt.split('T')[0] : '', // Observation_Date
      record.startTime ?? '',                              // Start_Time
      record.programName ?? record.program ?? '',          // Program_Name
      record.projectName ?? '',                            // Project_Name
      record.percentComplete ?? '',                        // Percent_Complete
      targetLocation,                                      // Location
      record.buildingLevel ?? '',                          // Building_Level
      record.weather ?? '',                                // Weather
      record.degreesF ?? '',                               // Degrees_F
      record.presentAtSite ?? '',                          // Present_at_Site
      targetType,                                          // Observation_Type
      record.changeReason ?? '',                           // Change_Reason
      record.priority ?? '',                               // Priority
      targetDescription,                                   // Description
      targetStatus,                                        // Status
      record.pmActionType ?? '',                           // PM_Action_Type
      record.changeStatus ?? '',                           // Change_Status
      targetComments,                                      // PM_Comments
      record.imageUrl ?? '',                               // Image_URL
      record.imageName ?? '',                              // Image_Name
      '',                                                  // AI_Risk_Analysis (Placeholder)
      new Date().toLocaleString(),                         // Timestamp
    ];

    // Direct write to your actual live tab name
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Google FOR!A:AB',
      valueInputOption: 'USER_ENTERED',
      requestBody: { 
        values: [row] 
      },
    });

    return NextResponse.json({ ok: true, message: 'Observation synced to Sheets.' });
  } catch (error) {
    console.error('Sheet sync route error', error);
    return NextResponse.json(
      { ok: false, message: 'Unable to sync the sheet entry.' },
      { status: 500 },
    );
  }
}
// @ts-nocheck
// File: src/firebase/functions.ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { google } from "googleapis";

const initializeSheetsClient = () => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT(
    clientEmail,
    undefined,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  return google.sheets({ version: "v4", auth });
};

export const syncObservationToGoogleSheets = onDocumentCreated(
  "field_observations/{observationId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const sheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!sheetId) return;

    try {
      const sheets = initializeSheetsClient();
      const rowValues = [
        data.id || event.params.observationId,
        data.program || "Unknown Track",
        data.workPackageId || "N/A",
        data.title || "Untitled Observation",
        data.status || "Open",
        data.loggedBy || "System Sync",
        data.timestamp || new Date().toISOString()
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "Sheet1!A:G", 
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues] },
      });
      console.log(`Successfully synced observation ${event.params.observationId}`);
    } catch (error) {
      console.error("Google Sheets sync failed:", error);
    }
  }
);
import { google } from 'googleapis';

/**
 * Appends a row of data to a Google Spreadsheet.
 * 
 * @param credentialsJson Stringified Google Cloud Service Account JSON credentials
 * @param spreadsheetId The ID of the target spreadsheet
 * @param sheetName The name of the tab in the spreadsheet (default 'Sheet1')
 * @param values Array of values representing a single row
 */
export const appendRowToSheet = async (
  credentialsJson: string, 
  spreadsheetId: string, 
  values: string[],
  sheetName: string = 'Sheet1'
) => {
  try {
    // 1. Parse Credentials
    const credentials = JSON.parse(credentialsJson);

    // 2. Authenticate with Google
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });

    // 3. Append Row
    const request = {
      spreadsheetId,
      range: `${sheetName}!A1`, // It will append to the next empty row below this
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [values]
      }
    };

    const response = await sheets.spreadsheets.values.append(request);
    console.log(`✅ Appended row to Google Sheets: ${response.data.updates?.updatedCells} cells updated.`);
    return true;
  } catch (error) {
    console.error('❌ Failed to append row to Google Sheets:', error);
    return false;
  }
};

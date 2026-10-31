import { IntegrationApiError, providerRequest } from "../../core/http-client";

const BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const PROVIDER = { slug: "google-sheets", name: "Google Sheets" };
const SPREADSHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;
/** Rows per values.append call (keeps each request well under 10 MB). */
export const SHEETS_APPEND_CHUNK = 5000;

export type CellValue = string | number | boolean | null;

export interface CreatedSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetId: number;
  sheetTitle: string;
}

/** Google's messages can quote cell contents (visitor data); keep codes only. */
const describeSheetsError = (body: unknown) => {
  const status = (body as { error?: { status?: unknown } })?.error?.status;
  return typeof status === "string" ? `request failed (${status}).` : undefined;
};

export function assertSpreadsheetId(id: string): string {
  if (!SPREADSHEET_ID.test(id)) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message: "That isn't a Google Sheets spreadsheet id.",
    });
  }
  return id;
}

/** A1 range for a sheet title: 'Scans'!A:J (quotes doubled). */
export function sheetRange(title: string, columns: string): string {
  return `'${title.replaceAll("'", "''")}'!${columns}`;
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Sheets API v4 with an OAuth token (spreadsheets + drive.file): creates
 * spreadsheets QRdx owns, appends rows in chunks, reads a column back for
 * retry dedupe.
 */
export class GoogleSheetsClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private request<T>(url: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      describeError: describeSheetsError,
    });
  }

  /** New spreadsheet with one sheet, a frozen bold header row and `header`. */
  async createSpreadsheet(input: {
    title: string;
    sheetTitle: string;
    header: string[];
  }): Promise<CreatedSpreadsheet> {
    const created = await this.request<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    }>(BASE_URL, {
      method: "POST",
      body: JSON.stringify({
        properties: { title: input.title.slice(0, 200) },
        sheets: [
          {
            properties: {
              title: input.sheetTitle,
              gridProperties: { frozenRowCount: 1 },
            },
            data: [
              {
                startRow: 0,
                startColumn: 0,
                rowData: [
                  {
                    values: input.header.map((label) => ({
                      userEnteredValue: { stringValue: label },
                      userEnteredFormat: { textFormat: { bold: true } },
                    })),
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    const sheet = created.sheets?.[0]?.properties;
    return {
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl,
      sheetId: sheet?.sheetId ?? 0,
      sheetTitle: sheet?.title ?? input.sheetTitle,
    };
  }

  /**
   * Appends rows (RAW: values are never parsed as formulas, so visitor input
   * like "=IMPORTXML(…)" stays text). Large inputs go in chunks.
   */
  async appendRows(
    spreadsheetId: string,
    range: string,
    rows: CellValue[][]
  ): Promise<{ appended: number }> {
    assertSpreadsheetId(spreadsheetId);
    let appended = 0;
    for (let start = 0; start < rows.length; start += SHEETS_APPEND_CHUNK) {
      const chunk = rows.slice(start, start + SHEETS_APPEND_CHUNK);
      const search = new URLSearchParams({
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
      });
      await this.request(
        `${BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?${search}`,
        { method: "POST", body: JSON.stringify({ values: chunk }) }
      );
      appended += chunk.length;
    }
    return { appended };
  }

  /** Reads one range's values (used to skip rows a lost response wrote). */
  async getValues(spreadsheetId: string, range: string): Promise<string[][]> {
    assertSpreadsheetId(spreadsheetId);
    const data = await this.request<{ values?: string[][] }>(
      `${BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`
    );
    return data.values ?? [];
  }
}

export function createGoogleSheetsClient(
  accessToken: string
): GoogleSheetsClient {
  return new GoogleSheetsClient(accessToken);
}

/** Revokes the grant (access and refresh tokens). */
export async function revokeGoogleToken(token: string): Promise<void> {
  await providerRequest(PROVIDER, GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
}

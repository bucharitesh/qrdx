import type { IntegrationDefinition } from "../../registry/types";

/**
 * Google Sheets: its own OAuth provider (separate grant from Google Drive).
 * drive.file only reaches spreadsheets QRdx creates.
 */
export const googleSheetsIntegration: IntegrationDefinition = {
  slug: "google-sheets",
  name: "Google Sheets",
  description:
    "Export scans and form responses to a new Google Sheet, and keep scans in sync",
  logos: {
    light: "/integrations/google-sheets.svg",
    dark: "/integrations/google-sheets.svg",
  },
  category: ["analytics"],
  type: "oauth",
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
    pkce: true,
    responseType: "code",
    extraParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
    },
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "google-sheets-scans",
      label: "Scans to a sheet",
      description:
        "Export the scans of one code or all codes to a new sheet (time, code, country, city, device, OS, browser, referrer, language), then optionally append new scans in batches.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["scans"],
      modes: ["export", "sync"],
    },
    {
      kind: "event-sink",
      id: "google-sheets-responses",
      label: "Form responses to a sheet",
      description:
        "Export a hosted page's form responses to a new sheet, one column per question.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["export"],
    },
  ],
  features: [
    "New spreadsheet per export, owned by your Google account",
    "Keep in sync: new scans appended in batches, never one call per scan",
    "Retries with backoff and no duplicate rows",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.google.com/sheets/about/",
};

import type { IntegrationDefinition } from "../../registry/types";

/**
 * Google Drive integration definition
 */
export const googleDriveIntegration: IntegrationDefinition = {
  slug: "google-drive",
  name: "Google Drive",
  description: "Import images and logos from Google Drive for your QR codes",
  logos: {
    light: "/integrations/google-drive-icon.svg",
    dark: "/integrations/google-drive-icon.svg",
  },
  category: ["storage", "assets"],
  type: "oauth",
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
    pkce: false,
    responseType: "code",
    extraParams: {
      access_type: "offline",
      prompt: "consent",
    },
  },
  capabilities: [
    {
      kind: "qr-content-source",
      id: "google-drive-file-qr",
      label: "Create QR codes for Drive files",
      description:
        "Select Google Drive files or folders and turn their share links into QR codes.",
      surfaces: [
        "editor-content-modal",
        "editor-content-form",
        "settings-detail",
      ],
      requiresConnection: true,
      contentType: "google-drive",
      sourceTypes: ["file", "folder"],
    },
    {
      kind: "asset-picker",
      id: "google-drive-image-assets",
      label: "Import Drive images",
      description: "Browse images from Google Drive for QR code assets.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      assetTypes: ["image", "svg"],
    },
    {
      kind: "manual-url-parser",
      id: "google-drive-manual-url",
      label: "Manual Drive URL",
      description:
        "Accept a Google Drive file or folder URL without connecting an account.",
      surfaces: ["editor-content-form"],
      requiresConnection: false,
      patterns: [
        {
          id: "google-drive-file-url",
          label: "Google Drive file or folder URL",
          pattern:
            "^https://(drive\\.google\\.com/(file/d|drive/folders)|docs\\.google\\.com/(document|spreadsheets|presentation|drawings)/d)/[A-Za-z0-9_-]+",
          example: "https://docs.google.com/spreadsheets/d/example/edit",
          contentType: "google-drive",
          targetField: "url",
        },
      ],
    },
  ],
  features: [
    "Browse your Drive files",
    "Import images for QR codes",
    "Search for files",
    "Preview thumbnails",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.google.com/drive/",
};

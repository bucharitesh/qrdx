import type { IntegrationDefinition } from "../../registry/types";

/**
 * Google Drive integration definition
 */
export const googleDriveIntegration: IntegrationDefinition = {
  slug: "google-drive",
  name: "Google Drive",
  description: "Import images and logos from Google Drive for your QR codes",
  logo: "/integrations/google-drive-icon.svg",
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
  },
  features: [
    "Browse your Drive files",
    "Import images for QR codes",
    "Search for files",
    "Preview thumbnails",
  ],
  configurable: false,
  developedBy: "Google",
  website: "https://www.google.com/drive/",
};

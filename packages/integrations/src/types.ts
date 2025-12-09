/**
 * Integration database record type (decrypted)
 */
export type Integration = {
  id: string;
  userId: string;
  provider: string;
  accessToken: string; // Decrypted when returned
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  metadata: Record<string, any> | null;
  status: "active" | "disconnected" | "error";
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * OAuth configuration
 */
export type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
  responseType?: string;
};

/**
 * OAuth token response structure
 */
export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
};

/**
 * Integration type
 */
export type IntegrationType = "oauth" | "api_key" | "webhook";

/**
 * Integration category
 */
export type IntegrationCategory =
  | "link-management"
  | "analytics"
  | "storage"
  | "assets"
  | "marketing"
  | "crm"
  | "communication";

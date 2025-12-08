// Core integration types
export interface Integration {
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
}

// OAuth token response structure
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

// Integration configuration
export interface IntegrationConfig {
  slug: string; // "dub"
  name: string; // "Dub.sh"
  type: "oauth" | "api_key" | "webhook";
  authUrl?: string; // OAuth authorize URL
  tokenUrl?: string; // OAuth token exchange URL
  scopes: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  supportsRefresh: boolean;
  pkce?: boolean; // PKCE support
}

// Integration config from config.json
export interface IntegrationConfigFile {
  slug: string;
  name: string;
  type: string;
  logo: string;
  url: string;
  categories: string[];
  description: string;
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    pkce?: boolean;
  };
}

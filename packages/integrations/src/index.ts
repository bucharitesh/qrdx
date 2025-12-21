/**
 * @repo/integrations
 * Centralized integration package for third-party services
 */

export {
  decryptApiKey,
  encryptApiKey,
} from "./core/encryption";
export {
  disconnectIntegration,
  getIntegration,
  getIntegrationById,
  hasIntegration,
  listUserIntegrations,
} from "./core/manager";
// Core utilities
export {
  createOAuthHandler,
  OAuthHandler,
} from "./core/oauth";
export {
  refreshIntegrationToken,
  shouldRefreshToken,
} from "./core/token-refresh";
export type {
  DubError,
  DubLink,
  DubWorkspace,
} from "./integrations/dub";
// Integrations - Dub
export {
  createDubClient,
  DubClient,
  dubIntegration,
} from "./integrations/dub";
export type {
  DriveFile,
  DriveFileList,
} from "./integrations/google-drive";
// Integrations - Google Drive
export {
  createGoogleDriveClient,
  GoogleDriveClient,
  googleDriveIntegration,
} from "./integrations/google-drive";
export {
  IMAGE_MIME_TYPES,
  IMAGE_QUERY,
} from "./integrations/google-drive/types";
// Registry
export {
  getIntegrationRegistry,
  IntegrationRegistry,
  initializeRegistry,
  resetRegistry,
} from "./registry";
// Registry loader
export {
  getIntegrationConfigWithEnv,
  initializeIntegrations,
  registerAllIntegrations,
} from "./registry/loader";
export type {
  IntegrationConfig,
  IntegrationDefinition,
} from "./registry/types";
// Types
export type {
  Integration,
  IntegrationCategory,
  IntegrationType,
  OAuthConfig,
  TokenResponse,
} from "./types";
// Utils
export {
  generateCodeChallenge,
  generateCodeVerifier,
  generatePKCE,
} from "./utils/pkce";

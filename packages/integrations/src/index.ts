/**
 * @repo/integrations
 * Centralized integration package for third-party services
 */

export type {
  AssetPickerCapability,
  IntegrationCapability,
  IntegrationLogoSet,
  ManualUrlParserCapability,
  QrContentSourceCapability,
  ShortLinkProviderCapability,
} from "@repo/integration-kit";
export {
  getCapabilityLabel,
  hasCapability,
  INTEGRATION_CAPABILITY_LABELS,
} from "@repo/integration-kit";
// Content sources (Stripe, Cal.com, Calendly, Shopify, YouTube, Spotify) and
// data out (Google Sheets, Slack, HubSpot, Mailchimp)
export {
  createContentSourceClient,
  DATA_REVOCABLE_PROVIDERS,
  fetchDataAccountMetadata,
  isMediaSourceConfigured,
  type MediaSourceEnv,
  renewShopifyToken,
  revokeDataProviderToken,
  type SourceKeyInput,
  shopifyTokenNeedsRenewal,
  type VerifiedCredentials,
  verifyContentSourceCredentials,
} from "./capabilities/data-factory";
// Short-link providers and file pickers (Bitly, Rebrandly, Short.io,
// Dropbox, OneDrive, Box, Notion)
export {
  createFilePickerClient,
  createShortLinkClient,
  fetchConnectedAccountMetadata,
  getDefaultShortLinkDomain,
  REVOCABLE_PROVIDERS,
  revokeProviderToken,
  verifyShortLinkCredentials,
} from "./capabilities/factory";
export type {
  FilePickerClient,
  PickerItem,
  PickerItemKind,
  PickerPage,
  ShareAccess,
  SharedLinkResult,
} from "./capabilities/file-picker";
export {
  FILE_PICKER_PROVIDERS,
  type FilePickerProviderSlug,
  isFilePickerProvider,
  isShortLinkProvider,
  SHORT_LINK_PROVIDERS,
  type ShortLinkProviderSlug,
  SLUG_SUPPORT,
} from "./capabilities/providers";
export type {
  CreateShortLinkInput,
  ShortLink,
  ShortLinkClient,
  ShortLinkDomain,
  ShortLinkGroup,
  ShortLinkPage,
} from "./capabilities/short-links";
export {
  decryptApiKey,
  encryptApiKey,
} from "./core/encryption";
export {
  IntegrationApiError,
  type IntegrationErrorCode,
  isIntegrationApiError,
} from "./core/http-client";
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
export { BitlyClient, createBitlyClient } from "./integrations/bitly";
export { BoxClient, createBoxClient } from "./integrations/box";
export { createDropboxClient, DropboxClient } from "./integrations/dropbox";
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
export {
  createGoogleSheetsClient,
  GoogleSheetsClient,
} from "./integrations/google-sheets";
export { createHubSpotClient, HubSpotClient } from "./integrations/hubspot";
export {
  createMailchimpClient,
  MailchimpClient,
} from "./integrations/mailchimp";
export { createNotionClient, NotionClient } from "./integrations/notion";
export { createOneDriveClient, OneDriveClient } from "./integrations/onedrive";
export {
  createRebrandlyClient,
  RebrandlyClient,
} from "./integrations/rebrandly";
export { createShortIoClient, ShortIoClient } from "./integrations/short-io";
export { readSlackInstall, type SlackInstall } from "./integrations/slack";
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
  IntegrationApiKeyConfig,
  IntegrationConfig,
  IntegrationDefinition,
} from "./registry/types";
export * from "./sinks/types";
export * from "./sources/types";
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

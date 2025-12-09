import { database as db, integration } from "@repo/database";
import { eq } from "drizzle-orm";
import type { Integration } from "../types";
import { decryptApiKey, encryptApiKey } from "./encryption";
import { createOAuthHandler } from "./oauth";

// Mutex to prevent concurrent token refreshes for the same integration
const refreshLocks = new Map<string, Promise<string>>();

/**
 * Check if a token should be refreshed (expires in < 5 minutes)
 */
export function shouldRefreshToken(integration: Integration): boolean {
  if (!integration.expiresAt) return false;

  const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
  const expiresIn = integration.expiresAt.getTime() - Date.now();

  return expiresIn < fiveMinutes;
}

/**
 * Refresh an integration's access token
 * Uses mutex to prevent concurrent refreshes
 */
export async function refreshIntegrationToken(
  integrationId: string,
  getConfig: (provider: string) => any
): Promise<string> {
  // Check if there's already a refresh in progress
  const existingRefresh = refreshLocks.get(integrationId);
  if (existingRefresh) {
    console.log(
      `Waiting for existing refresh for integration ${integrationId}`
    );
    return existingRefresh;
  }

  // Create new refresh promise
  const refreshPromise = performTokenRefresh(integrationId, getConfig);
  refreshLocks.set(integrationId, refreshPromise);

  try {
    const newToken = await refreshPromise;
    return newToken;
  } finally {
    // Clean up lock
    refreshLocks.delete(integrationId);
  }
}

/**
 * Perform the actual token refresh
 */
async function performTokenRefresh(
  integrationId: string,
  getConfig: (provider: string) => any
): Promise<string> {
  // Load integration from database
  const result = await db
    .select()
    .from(integration)
    .where(eq(integration.id, integrationId))
    .limit(1);

  if (result.length === 0) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  const integrationData = result[0];

  // Check if integration has a refresh token
  if (!integrationData.refreshToken) {
    throw new Error(
      `Integration ${integrationId} does not have a refresh token`
    );
  }

  // Get provider config
  const config = getConfig(integrationData.provider);

  if (!config.supportsRefresh) {
    throw new Error(
      `Provider ${integrationData.provider} does not support token refresh`
    );
  }

  // Decrypt refresh token
  const decryptedRefreshToken = decryptApiKey(integrationData.refreshToken);

  // Create OAuth handler and refresh token
  const oauthHandler = createOAuthHandler(config);

  try {
    const tokenResponse = await oauthHandler.refreshAccessToken(
      decryptedRefreshToken
    );

    // Calculate new expiration timestamp
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null;

    // Encrypt new tokens
    const encryptedAccessToken = encryptApiKey(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encryptApiKey(tokenResponse.refresh_token)
      : integrationData.refreshToken; // Keep old refresh token if not returned

    // Update database
    await db
      .update(integration)
      .set({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(integration.id, integrationId));

    console.log(
      `Successfully refreshed token for integration ${integrationId}`
    );

    return tokenResponse.access_token;
  } catch (error) {
    console.error(
      `Failed to refresh token for integration ${integrationId}:`,
      error
    );

    // Mark integration as error state
    await db
      .update(integration)
      .set({
        status: "error",
        updatedAt: new Date(),
      })
      .where(eq(integration.id, integrationId));

    throw new Error(
      `Failed to refresh token: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

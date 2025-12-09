import { database as db, integration } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { Integration } from "../types";
import { decryptApiKey } from "./encryption";
import { refreshIntegrationToken, shouldRefreshToken } from "./token-refresh";

/**
 * Decrypt integration tokens
 */
function decryptIntegration(
  integrationData: typeof integration.$inferSelect
): Integration {
  return {
    ...integrationData,
    accessToken: decryptApiKey(integrationData.accessToken),
    refreshToken: integrationData.refreshToken
      ? decryptApiKey(integrationData.refreshToken)
      : null,
    status: integrationData.status as "active" | "disconnected" | "error",
    metadata: integrationData.metadata as Record<string, any> | null,
  };
}

/**
 * Get an integration for a user and provider, with automatic token refresh
 */
export async function getIntegration(
  userId: string,
  provider: string,
  getConfig: (provider: string) => any
): Promise<Integration | null> {
  // Fetch integration from database
  const result = await db
    .select()
    .from(integration)
    .where(
      and(eq(integration.userId, userId), eq(integration.provider, provider))
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const integrationData = result[0];

  // Check if we need to refresh the token
  const decryptedIntegration = decryptIntegration(integrationData);

  if (shouldRefreshToken(decryptedIntegration)) {
    try {
      console.log(`Auto-refreshing token for ${provider} integration`);
      const freshAccessToken = await refreshIntegrationToken(
        integrationData.id,
        getConfig
      );

      // Return integration with fresh token
      return {
        ...decryptedIntegration,
        accessToken: freshAccessToken,
      };
    } catch (error) {
      console.error(`Failed to auto-refresh token for ${provider}:`, error);
      // Return the integration anyway, but it might be expired
      // The calling code can handle the error
      return decryptedIntegration;
    }
  }

  // Update lastSyncAt to track usage
  await db
    .update(integration)
    .set({
      lastSyncAt: new Date(),
    })
    .where(eq(integration.id, integrationData.id));

  return decryptedIntegration;
}

/**
 * Get an integration by ID
 */
export async function getIntegrationById(
  integrationId: string
): Promise<Integration | null> {
  const result = await db
    .select()
    .from(integration)
    .where(eq(integration.id, integrationId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return decryptIntegration(result[0]);
}

/**
 * List all integrations for a user
 */
export async function listUserIntegrations(
  userId: string
): Promise<Integration[]> {
  const result = await db
    .select()
    .from(integration)
    .where(eq(integration.userId, userId));

  return result.map(decryptIntegration);
}

/**
 * Disconnect an integration
 */
export async function disconnectIntegration(
  userId: string,
  provider: string
): Promise<void> {
  await db
    .delete(integration)
    .where(
      and(eq(integration.userId, userId), eq(integration.provider, provider))
    );
}

/**
 * Check if a user has an active integration for a provider
 */
export async function hasIntegration(
  userId: string,
  provider: string
): Promise<boolean> {
  const result = await db
    .select({ id: integration.id })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, provider),
        eq(integration.status, "active")
      )
    )
    .limit(1);

  return result.length > 0;
}

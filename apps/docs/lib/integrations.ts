/**
 * Legacy integrations file - Re-exports from the new @repo/integrations package
 * This file is kept for backwards compatibility during migration
 */

import { getIntegrationConfigWithEnv } from "@repo/integrations/src/registry/loader";
import { env } from "./env";

// Re-export core functionality from new package
// Re-export Dub client
export {
  createDubClient as getDubClient,
  decryptApiKey,
  disconnectIntegration,
  encryptApiKey,
  getIntegration,
  hasIntegration,
  listUserIntegrations,
} from "@repo/integrations";

// Legacy function for backwards compatibility
export async function getDubIntegration(userId: string) {
  const { getIntegration } = await import("@repo/integrations");
  const integration = await getIntegration(userId, "dub", (slug) =>
    getIntegrationConfigWithEnv(slug, env),
  );

  if (!integration) return null;

  return {
    ...integration,
    // For backwards compatibility, also expose as apiKey
    apiKey: integration.accessToken,
  };
}

// Validate Dub.sh API key
export async function validateDubApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.dub.co/workspaces", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error("Dub.sh API validation error:", error);
    return false;
  }
}

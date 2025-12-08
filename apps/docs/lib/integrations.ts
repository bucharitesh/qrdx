/**
 * Legacy integrations file - Re-exports from the new integrations system
 * This file is kept for backwards compatibility
 */

// Re-export core functionality from new system
export {
  decryptApiKey,
  encryptApiKey,
} from "./integrations/encryption";

export {
  disconnectIntegration,
  getIntegration,
  hasIntegration,
  listUserIntegrations,
} from "./integrations/manager";

export { getDubClient } from "./integrations/providers/dub/client";

// Legacy function for backwards compatibility
export async function getDubIntegration(userId: string) {
  const { getIntegration } = await import("./integrations/manager");
  const integration = await getIntegration(userId, "dub");

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

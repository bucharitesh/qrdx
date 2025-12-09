import { Dub } from "dub";
import { getIntegration } from "../../manager";

/**
 * Get a configured Dub SDK client for a user
 * Automatically handles token refresh if needed
 */
export async function getDubClient(userId: string): Promise<Dub> {
  const integration = await getIntegration(userId, "dub");

  if (!integration) {
    throw new Error(
      "Dub integration not connected. Please connect Dub.sh in your integration settings."
    );
  }

  if (integration.status !== "active") {
    throw new Error(
      `Dub integration is ${integration.status}. Please reconnect in your integration settings.`
    );
  }

  // Create and return Dub client with auto-refreshed token
  return new Dub({
    token: integration.accessToken,
  });
}


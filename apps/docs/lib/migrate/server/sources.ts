import "server-only";

import {
  createDubClient,
  createShortLinkClient,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { getConnection } from "@/lib/connected-accounts/server";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible, setupNeeded } from "@/lib/integration-availability-rules";
import { isIntegrationConfigured } from "@/lib/integration-oauth";
import { dubSource, shortLinkSource } from "../adapters";
import { ImportError } from "../importer";
import {
  API_PROVIDER_IDS,
  API_PROVIDERS,
  type ApiProviderId,
} from "../providers";
import type { MigrationSource, ProviderStatus } from "../types";

initializeIntegrations();

export async function providerStatuses(
  userId: string,
): Promise<ProviderStatus[]> {
  const registry = getIntegrationRegistry();
  const availability = getIntegrationAvailability();
  return Promise.all(
    API_PROVIDER_IDS.map(async (id): Promise<ProviderStatus> => {
      const slug = API_PROVIDERS[id].integration;
      const definition = registry.get(slug);
      // Production and preview: providers that need setup aren't offered.
      if (!(definition && isVisible(availability, slug))) {
        return {
          id,
          connection: "none",
          oauth: false,
          apiKey: null,
          available: false,
        };
      }
      const connection = await getConnection(userId, slug).catch(() => null);
      return {
        id,
        connection: connection
          ? connection.status === "active"
            ? "active"
            : "error"
          : "none",
        oauth: definition.type === "oauth" && isIntegrationConfigured(slug),
        apiKey: definition.apiKey
          ? {
              label: definition.apiKey.label,
              placeholder: definition.apiKey.placeholder,
              helpUrl: definition.apiKey.helpUrl,
              helpText: definition.apiKey.helpText,
            }
          : null,
        available: true,
        needsSetup: setupNeeded(availability, slug),
      };
    }),
  );
}

/** The user's connected account as a MigrationSource (token stays server-side). */
export async function getSource(
  userId: string,
  provider: ApiProviderId,
): Promise<MigrationSource> {
  const { integration: slug, name } = API_PROVIDERS[provider];
  const connection = await getConnection(userId, slug);
  if (!connection) {
    throw new ImportError(404, "NOT_CONNECTED", `Connect ${name} first.`);
  }
  if (connection.status !== "active") {
    throw new ImportError(
      409,
      "RECONNECT",
      `Reconnect ${name}: it rejected the saved connection.`,
    );
  }
  if (provider === "dub")
    return dubSource(createDubClient(connection.accessToken));
  return shortLinkSource(
    provider,
    createShortLinkClient(provider, {
      accessToken: connection.accessToken,
      metadata: connection.metadata,
    }),
  );
}

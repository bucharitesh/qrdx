import { auth } from "@repo/auth/server";
import {
  getIntegration,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import {
  getIntegrationAvailability,
  getStoredConnections,
} from "@/lib/integration-availability";
import {
  hiddenSlugs,
  isVisible,
  settingsListing,
  setupNeeded,
} from "@/lib/integration-availability-rules";
import { isIntegrationConfigured } from "@/lib/integration-oauth";
import { SettingsHeader } from "../components/settings-header";
import {
  IntegrationsClient,
  type IntegrationWithStatus,
} from "./components/integrations-client";

// Initialize integrations on module load
initializeIntegrations();

export default async function IntegrationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

  // Every registry integration this deployment can offer. Production and
  // preview builds leave out the ones that need setup; local dev keeps them
  // with a "Needs setup" badge (env variable names only).
  const registry = getIntegrationRegistry();
  const availability = getIntegrationAvailability();
  const availableIntegrations = registry
    .getAll()
    .filter((integration) => isVisible(availability, integration.slug));

  // Hidden ones this user connected before they were hidden stay listed
  // (marked "No longer available") so they can be disconnected.
  const leftovers = await getStoredConnections(
    session.user.id,
    hiddenSlugs(
      availability,
      registry.getAll().map((integration) => integration.slug),
    ),
  ).catch((error) => {
    console.error("Failed to load hidden integrations:", error);
    return new Map<string, never>();
  });
  const noLongerAvailable: IntegrationWithStatus[] = registry
    .getAll()
    .flatMap((integration) => {
      const stored = leftovers.get(integration.slug);
      if (
        !stored ||
        settingsListing(availability, integration.slug, true) !==
          "no-longer-available"
      ) {
        return [];
      }
      return [
        {
          ...integration,
          isConfigured: false,
          isConnected: true,
          noLongerAvailable: true,
          status: stored.status,
          connectedAt: stored.createdAt,
        },
      ];
    });

  // Fetch connection status for each integration
  const integrationStatuses = await Promise.all(
    availableIntegrations.map(async (integration) => {
      try {
        const needsSetup = setupNeeded(availability, integration.slug);
        if (!isIntegrationConfigured(integration.slug)) {
          return {
            ...integration,
            needsSetup,
            isConfigured: false,
            isConnected: false,
            status: undefined as
              | "active"
              | "disconnected"
              | "error"
              | undefined,
            metadata: undefined as any,
            connectedAt: undefined as Date | undefined,
          };
        }

        const connectedIntegration = await getIntegration(
          session.user.id,
          integration.slug,
          (slug) => getIntegrationConfigWithEnv(slug, env),
        );

        return {
          ...integration,
          needsSetup,
          isConfigured: true,
          isConnected: !!connectedIntegration,
          status: connectedIntegration?.status as
            | "active"
            | "disconnected"
            | "error"
            | undefined,
          metadata: connectedIntegration?.metadata as any,
          connectedAt: connectedIntegration?.createdAt as Date | undefined,
        };
      } catch (error) {
        console.error(`Failed to fetch status for ${integration.slug}:`, error);
        return {
          ...integration,
          needsSetup: setupNeeded(availability, integration.slug),
          isConfigured: false,
          isConnected: false,
          status: undefined as "active" | "disconnected" | "error" | undefined,
          metadata: undefined as any,
          connectedAt: undefined as Date | undefined,
        };
      }
    }),
  );

  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Integrations"
        description="Connect third-party services to enhance your QR codes"
      />
      <IntegrationsClient
        integrations={[...integrationStatuses, ...noLongerAvailable]}
        hiddenSlugs={Object.keys(availability.needsSetup).filter(
          (slug) => !isVisible(availability, slug),
        )}
      />
    </div>
  );
}

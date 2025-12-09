import {
  getIntegration,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { SettingsHeader } from "../components/settings-header";
import { IntegrationCard } from "./components/integration-card";

// Initialize integrations on module load
initializeIntegrations();

export default async function IntegrationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

  // Get all available integrations from registry
  const registry = getIntegrationRegistry();
  const availableIntegrations = registry.getAll();

  // Fetch connection status for each integration
  const integrationStatuses = await Promise.all(
    availableIntegrations.map(async (integration) => {
      try {
        // Check if this integration is configured (has env vars)
        const isConfigured = (() => {
          try {
            getIntegrationConfigWithEnv(integration.slug, env);
            return true;
          } catch {
            return false;
          }
        })();

        if (!isConfigured) {
          return {
            ...integration,
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

        // Get connection status from database
        const config = getIntegrationConfigWithEnv(integration.slug, env);
        const connectedIntegration = await getIntegration(
          session.user.id,
          integration.slug,
          (slug) => getIntegrationConfigWithEnv(slug, env),
        );

        return {
          ...integration,
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrationStatuses.map((integration) => (
          <IntegrationCard
            key={integration.slug}
            name={integration.name}
            slug={integration.slug}
            description={integration.description}
            logo={integration.logo}
            isConnected={integration.isConnected}
            isConfigured={integration.isConfigured}
            status={integration.status}
            metadata={integration.metadata}
            connectedAt={integration.connectedAt}
            features={integration.features}
            category={integration.category}
          />
        ))}
      </div>
    </div>
  );
}

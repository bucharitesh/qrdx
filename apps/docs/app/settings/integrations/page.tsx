import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getIntegration } from "@/lib/integrations";
import { SettingsHeader } from "../components/settings-header";
import { IntegrationCard } from "./components/integration-card";

export default async function IntegrationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

  // Get Dub integration status
  const dubIntegration = await getIntegration(session.user.id, "dub");

  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Integrations"
        description="Connect third-party services to enhance your QR codes"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          name="Dub.sh"
          slug="dub"
          description="Create and track short links with advanced analytics"
          logo="/integrations/dub-icon.svg"
          isConnected={!!dubIntegration}
          status={dubIntegration?.status}
          metadata={dubIntegration?.metadata}
          connectedAt={dubIntegration?.createdAt}
        />

        {/* Placeholder for future integrations */}
        <div className="border-muted bg-muted/20 flex items-center justify-center rounded-lg border-2 border-dashed p-8">
          <p className="text-muted-foreground text-sm">
            More integrations coming soon...
          </p>
        </div>
      </div>
    </div>
  );
}


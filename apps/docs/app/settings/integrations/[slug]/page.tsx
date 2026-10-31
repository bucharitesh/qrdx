import { auth } from "@repo/auth/server";
import {
  getIntegration,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible, setupNeeded } from "@/lib/integration-availability-rules";
import {
  isIntegrationConfigured,
  isOAuthConfigured,
} from "@/lib/integration-oauth";
import { IntegrationDetail } from "./components/integration-detail";

initializeIntegrations();

interface IntegrationPageProps {
  params: Promise<{ slug: string }>;
}

export default async function IntegrationPage({
  params,
}: IntegrationPageProps) {
  const { slug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

  const registry = getIntegrationRegistry();
  const integration = registry.get(slug);

  if (!integration) notFound();

  // Production and preview: an integration that needs setup doesn't exist
  // for users. Local dev shows it with the env variable names it needs.
  const availability = getIntegrationAvailability();
  if (!isVisible(availability, slug)) notFound();

  const isConfigured = isIntegrationConfigured(slug);

  let isConnected = false;
  let status: "active" | "disconnected" | "error" | undefined;
  let connectedAt: Date | undefined;
  let metadata: Record<string, unknown> | undefined;

  if (isConfigured) {
    try {
      const connectedIntegration = await getIntegration(
        session.user.id,
        slug,
        (s) => getIntegrationConfigWithEnv(s, env),
      );
      isConnected = !!connectedIntegration;
      status = connectedIntegration?.status as typeof status;
      connectedAt = connectedIntegration?.createdAt as Date | undefined;
      metadata = connectedIntegration?.metadata ?? undefined;
    } catch {
      // leave defaults
    }
  }

  return (
    <IntegrationDetail
      slug={integration.slug}
      name={integration.name}
      description={integration.description}
      logos={integration.logos}
      capabilities={integration.capabilities}
      features={integration.features}
      developedBy={integration.developedBy}
      website={integration.website}
      category={integration.category}
      isConfigured={isConfigured}
      needsSetup={setupNeeded(availability, slug)}
      oauthConfigured={isOAuthConfigured(slug)}
      apiKey={integration.apiKey}
      isConnected={isConnected}
      status={status}
      connectedAt={connectedAt}
      metadata={metadata}
    />
  );
}

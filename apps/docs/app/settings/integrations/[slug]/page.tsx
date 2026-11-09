import { auth } from "@repo/auth/server";
import {
  getIntegration,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { env } from "@/lib/env";
import {
  getIntegrationAvailability,
  getStoredConnections,
  isUnavailableMock,
  SAMPLE_STORED_CONNECTION,
} from "@/lib/integration-availability";
import {
  isVisible,
  settingsListing,
  setupNeeded,
} from "@/lib/integration-availability-rules";
import {
  isIntegrationConfigured,
  isOAuthConfigured,
} from "@/lib/integration-oauth";
import { IntegrationDetail } from "./components/integration-detail";

initializeIntegrations();

interface IntegrationPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IntegrationPage({
  params,
  searchParams,
}: IntegrationPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

  const registry = getIntegrationRegistry();
  const integration = registry.get(slug);

  if (!integration) notFound();

  // Production and preview: an integration that needs setup doesn't exist
  // for users, unless they connected it before it was hidden: then this page
  // only lets them disconnect it. Local dev shows it with the env variable
  // names it needs.
  const availability = getIntegrationAvailability();
  const mock = isUnavailableMock(query["integrations-mock"]);
  if (mock || !isVisible(availability, slug)) {
    const stored = mock
      ? SAMPLE_STORED_CONNECTION
      : (await getStoredConnections(session.user.id, [slug])).get(slug);
    const listing = mock
      ? "no-longer-available"
      : settingsListing(availability, slug, Boolean(stored));
    if (listing !== "no-longer-available" || !stored) notFound();
    return (
      <ConfirmIdentityProvider>
        <IntegrationDetail
          slug={integration.slug}
          name={integration.name}
          description={integration.description}
          logos={integration.logos}
          capabilities={[]}
          features={[]}
          category={[]}
          isConfigured={false}
          isConnected
          noLongerAvailable
          status={stored.status}
          connectedAt={stored.createdAt}
        />
      </ConfirmIdentityProvider>
    );
  }

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

  // Connecting Slack or a data-out tool asks "Confirm it's you" first
  // (lib/data-connections/connect-confirmation.ts); one dialog for the page.
  return (
    <ConfirmIdentityProvider>
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
    </ConfirmIdentityProvider>
  );
}

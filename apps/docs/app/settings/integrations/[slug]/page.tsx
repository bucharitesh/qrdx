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

  const isConfigured = (() => {
    try {
      getIntegrationConfigWithEnv(slug, env);
      return true;
    } catch {
      return false;
    }
  })();

  let isConnected = false;
  let status: "active" | "disconnected" | "error" | undefined;
  let connectedAt: Date | undefined;

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
    } catch {
      // leave defaults
    }
  }

  return (
    <IntegrationDetail
      slug={integration.slug}
      name={integration.name}
      description={integration.description}
      logo={integration.logo}
      features={integration.features}
      developedBy={integration.developedBy}
      website={integration.website}
      category={integration.category}
      isConfigured={isConfigured}
      isConnected={isConnected}
      status={status}
      connectedAt={connectedAt}
    />
  );
}

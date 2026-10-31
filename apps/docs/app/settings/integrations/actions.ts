"use server";

import { auth } from "@repo/auth/server";
import {
  disconnectIntegration,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { headers } from "next/headers";
import {
  connectLimiter,
  revokeStoredToken,
} from "@/lib/connected-accounts/server";
import { cleanupDataConnection } from "@/lib/data-connections/server";
import {
  createIntegrationAuthUrl,
  isOAuthConfigured,
} from "@/lib/integration-oauth";
import { enforceRateLimits } from "@/lib/request-guards";

// Initialize integrations on module load
initializeIntegrations();

export async function connectIntegrationAction(provider: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const definition = getIntegrationRegistry().get(provider);
  if (!definition) {
    throw new Error(`Unknown integration: ${provider}`);
  }

  // OAuth needs app credentials; API-key-only providers never start a flow
  if (!isOAuthConfigured(provider)) {
    throw new Error(`${definition.name} is not configured on this server`);
  }

  await enforceRateLimits([
    {
      limiter: connectLimiter,
      key: `integrations:oauth:${session.user.id}`,
    },
  ]);

  const authUrl = await createIntegrationAuthUrl(provider);

  return { url: authUrl };
}

export async function disconnectIntegrationAction(provider: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  await enforceRateLimits([
    {
      limiter: connectLimiter,
      key: `integrations:disconnect:${session.user.id}`,
    },
  ]);

  // Revoke at the provider where its API allows it, then delete the row
  const revoked =
    (await revokeStoredToken(session.user.id, provider)) ||
    (await cleanupDataConnection(session.user.id, provider));
  await disconnectIntegration(session.user.id, provider);

  return { success: true, revoked };
}

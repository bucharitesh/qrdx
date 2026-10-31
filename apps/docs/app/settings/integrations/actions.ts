"use server";

import { auth } from "@repo/auth/server";
import {
  disconnectIntegration,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { headers } from "next/headers";
import {
  createIntegrationAuthUrl,
  isIntegrationConfigured,
} from "@/lib/integration-oauth";

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

  if (!isIntegrationConfigured(provider)) {
    throw new Error(`${definition.name} is not configured on this server`);
  }

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

  await disconnectIntegration(session.user.id, provider);

  return { success: true };
}

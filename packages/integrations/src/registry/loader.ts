import { dubIntegration } from "../integrations/dub/config";
import { googleDriveIntegration } from "../integrations/google-drive/config";
import { getIntegrationRegistry } from "./index";
import type { IntegrationConfig } from "./types";

/**
 * Load integration configuration with environment credentials
 */
function loadIntegrationConfig(
  slug: string,
  envVars: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }
): IntegrationConfig | null {
  const registry = getIntegrationRegistry();
  const definition = registry.get(slug);

  if (!definition) {
    return null;
  }

  return {
    ...definition,
    clientId: envVars.clientId,
    clientSecret: envVars.clientSecret,
    redirectUri: envVars.redirectUri,
    supportsRefresh: true, // Default to true for OAuth providers
  };
}

/**
 * Register all available integrations with the registry
 */
export function registerAllIntegrations(): void {
  const registry = getIntegrationRegistry();

  // Register Dub
  registry.register(dubIntegration);

  // Register Google Drive
  registry.register(googleDriveIntegration);
}

/**
 * Get integration config by slug with environment credentials
 */
export function getIntegrationConfigWithEnv(
  slug: string,
  env: Record<string, string | undefined>
): IntegrationConfig {
  // Map slug to environment variable names
  const envMappings: Record<string, {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }> = {
    dub: {
      clientId: "DUB_CLIENT_ID",
      clientSecret: "DUB_CLIENT_SECRET",
      redirectUri: "DUB_REDIRECT_URI",
    },
    "google-drive": {
      clientId: "GOOGLE_CLIENT_ID",
      clientSecret: "GOOGLE_CLIENT_SECRET",
      redirectUri: "GOOGLE_DRIVE_REDIRECT_URI",
    },
  };

  const mapping = envMappings[slug];
  if (!mapping) {
    throw new Error(`Unknown integration: ${slug}`);
  }

  const clientId = env[mapping.clientId];
  const clientSecret = env[mapping.clientSecret];
  const redirectUri = env[mapping.redirectUri];

  if (!(clientId && clientSecret && redirectUri)) {
    throw new Error(
      `Missing environment variables for ${slug} integration. Required: ${mapping.clientId}, ${mapping.clientSecret}, ${mapping.redirectUri}`
    );
  }

  const config = loadIntegrationConfig(slug, {
    clientId,
    clientSecret,
    redirectUri,
  });

  if (!config) {
    throw new Error(`Integration config not found: ${slug}`);
  }

  return config;
}

/**
 * Initialize the registry and register all integrations
 */
export function initializeIntegrations(): void {
  registerAllIntegrations();
}


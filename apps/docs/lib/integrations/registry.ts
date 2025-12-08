import fs from "fs";
import path from "path";
import { env } from "@/lib/env";
import type { IntegrationConfig, IntegrationConfigFile } from "./types";

/**
 * Load integration configuration from the integration folder
 */
function loadIntegrationConfigFile(
  provider: string,
): IntegrationConfigFile | null {
  try {
    const configPath = path.join(
      process.cwd(),
      "..",
      "..",
      provider,
      "config.json",
    );
    const configContent = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(configContent) as IntegrationConfigFile;
  } catch (error) {
    console.error(`Failed to load config for ${provider}:`, error);
    return null;
  }
}

/**
 * Load full integration config (config.json + env vars)
 */
function loadIntegrationConfig(provider: string): IntegrationConfig | null {
  const configFile = loadIntegrationConfigFile(provider);

  if (!configFile) {
    return null;
  }

  // For now, only support Dub - can extend for other providers
  if (provider === "dub") {
    return {
      slug: configFile.slug,
      name: configFile.name,
      type: "oauth",
      authUrl:
        configFile.oauth?.authUrl || "https://app.dub.co/oauth/authorize",
      tokenUrl: configFile.oauth?.tokenUrl || "https://api.dub.co/oauth/token",
      scopes: configFile.oauth?.scopes || ["workspaces.read"],
      clientId: env.DUB_CLIENT_ID,
      clientSecret: env.DUB_CLIENT_SECRET,
      redirectUri: env.DUB_REDIRECT_URI,
      supportsRefresh: true,
      pkce: configFile.oauth?.pkce ?? true,
    };
  }

  return null;
}

/**
 * Integration registry - central registry of all available integrations
 */
export const integrationRegistry: Record<string, IntegrationConfig> = {
  dub: loadIntegrationConfig("dub")!,
  // Future integrations:
  // "google-analytics": loadIntegrationConfig("google-analytics"),
};

/**
 * Get integration config by provider slug
 */
export function getIntegrationConfig(provider: string): IntegrationConfig {
  const config = integrationRegistry[provider];

  if (!config) {
    throw new Error(`Integration config not found for provider: ${provider}`);
  }

  return config;
}

/**
 * Get list of all available integrations
 */
export function getAvailableIntegrations(): IntegrationConfig[] {
  return Object.values(integrationRegistry).filter(Boolean);
}


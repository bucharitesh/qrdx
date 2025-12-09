import fs from "fs";
import path from "path";
import { env } from "@/lib/env";
import type { IntegrationConfig, IntegrationConfigFile } from "./types";

const defaultIntegrationConfigs: Record<string, IntegrationConfigFile> = {
  dub: {
    slug: "dub",
    name: "Dub.sh",
    type: "oauth",
    logo: "/integrations/dub-icon.svg",
    url: "https://dub.co",
    categories: ["links", "analytics"],
    description:
      "Create and track short links with advanced analytics via Dub OAuth",
    oauth: {
      authUrl: "https://app.dub.co/oauth/authorize",
      tokenUrl: "https://api.dub.co/oauth/token",
      scopes: ["workspaces.read", "links.read", "links.write"],
      pkce: true,
    },
  },
};

/**
 * Load integration configuration from the integration folder
 */
function loadIntegrationConfigFile(
  provider: string,
): IntegrationConfigFile | null {
  const fallbackConfig = defaultIntegrationConfigs[provider];
  try {
    const configPath = path.join(
      process.cwd(),
      "..",
      "..",
      provider,
      "config.json",
    );
    if (!fs.existsSync(configPath)) {
      return fallbackConfig ?? null;
    }

    const configContent = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(configContent) as IntegrationConfigFile;

    if (!fallbackConfig) {
      return parsed;
    }

    const mergedOauth =
      fallbackConfig.oauth || parsed.oauth
        ? {
            authUrl:
              parsed.oauth?.authUrl ?? fallbackConfig.oauth?.authUrl ?? "",
            tokenUrl:
              parsed.oauth?.tokenUrl ?? fallbackConfig.oauth?.tokenUrl ?? "",
            scopes: parsed.oauth?.scopes ?? fallbackConfig.oauth?.scopes ?? [],
            pkce: parsed.oauth?.pkce ?? fallbackConfig.oauth?.pkce,
          }
        : undefined;

    return {
      ...fallbackConfig,
      ...parsed,
      ...(mergedOauth ? { oauth: mergedOauth } : {}),
    };
  } catch (error) {
    console.error(`Failed to load config for ${provider}:`, error);
    return fallbackConfig ?? null;
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
      scopes: configFile.oauth?.scopes || [
        "workspaces.read",
        "links.read",
        "links.write",
      ],
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
const providers = ["dub"] as const;

export const integrationRegistry: Record<string, IntegrationConfig> =
  providers.reduce<Record<string, IntegrationConfig>>((registry, provider) => {
    const config = loadIntegrationConfig(provider);
    if (config) {
      registry[provider] = config;
    }
    return registry;
  }, {});

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

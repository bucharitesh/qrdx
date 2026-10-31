import { bitlyIntegration } from "../integrations/bitly/config";
import { boxIntegration } from "../integrations/box/config";
import { calcomIntegration } from "../integrations/calcom/config";
import { calendlyIntegration } from "../integrations/calendly/config";
import { dropboxIntegration } from "../integrations/dropbox/config";
import { dubIntegration } from "../integrations/dub/config";
import { googleDriveIntegration } from "../integrations/google-drive/config";
import { googleSheetsIntegration } from "../integrations/google-sheets/config";
import { hubspotIntegration } from "../integrations/hubspot/config";
import { mailchimpIntegration } from "../integrations/mailchimp/config";
import { notionIntegration } from "../integrations/notion/config";
import { oneDriveIntegration } from "../integrations/onedrive/config";
import { rebrandlyIntegration } from "../integrations/rebrandly/config";
import { shopifyIntegration } from "../integrations/shopify/config";
import { shortIoIntegration } from "../integrations/short-io/config";
import { slackIntegration } from "../integrations/slack/config";
import { spotifyIntegration } from "../integrations/spotify/config";
import { stripeIntegration } from "../integrations/stripe/config";
import { youtubeIntegration } from "../integrations/youtube/config";
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

  // Short-link providers
  registry.register(bitlyIntegration);
  registry.register(rebrandlyIntegration);
  registry.register(shortIoIntegration);

  // File and page pickers
  registry.register(dropboxIntegration);
  registry.register(oneDriveIntegration);
  registry.register(boxIntegration);
  registry.register(notionIntegration);

  // Content sources
  registry.register(stripeIntegration);
  registry.register(calcomIntegration);
  registry.register(calendlyIntegration);
  registry.register(shopifyIntegration);
  registry.register(youtubeIntegration);
  registry.register(spotifyIntegration);

  // Data out
  registry.register(googleSheetsIntegration);
  registry.register(slackIntegration);
  registry.register(hubspotIntegration);
  registry.register(mailchimpIntegration);
}

/**
 * Origin OAuth callbacks are built on, matching apps/docs `baseUrl`:
 * localhost in development, else the production domain or app URL.
 */
export function getIntegrationRedirectOrigin(): string {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "https://qrdx.dev");
  return origin.replace(/\/+$/, "");
}

/** `<origin>/api/integrations/<slug>/callback` */
export function getIntegrationRedirectUri(slug: string): string {
  return `${getIntegrationRedirectOrigin()}/api/integrations/${slug}/callback`;
}

/**
 * Get integration config by slug with environment credentials
 */
export function getIntegrationConfigWithEnv(
  slug: string,
  env: Record<string, string | undefined>
): IntegrationConfig {
  // API-key-only integrations need no app credentials
  const definition = getIntegrationRegistry().get(slug);
  // "none": smart link parsers that never connect (YouTube, Spotify)
  if (definition?.type === "api_key" || definition?.type === "none") {
    return {
      ...definition,
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      supportsRefresh: false,
    };
  }

  // Map slug to environment variable names. Without `redirectUri`, the
  // callback is built from the app origin (getIntegrationRedirectUri).
  const envMappings: Record<
    string,
    {
      clientId: string;
      clientSecret: string;
      redirectUri?: string;
    }
  > = {
    bitly: { clientId: "BITLY_CLIENT_ID", clientSecret: "BITLY_CLIENT_SECRET" },
    dropbox: {
      clientId: "DROPBOX_CLIENT_ID",
      clientSecret: "DROPBOX_CLIENT_SECRET",
    },
    onedrive: {
      clientId: "MICROSOFT_CLIENT_ID",
      clientSecret: "MICROSOFT_CLIENT_SECRET",
    },
    box: { clientId: "BOX_CLIENT_ID", clientSecret: "BOX_CLIENT_SECRET" },
    notion: {
      clientId: "NOTION_CLIENT_ID",
      clientSecret: "NOTION_CLIENT_SECRET",
    },
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
    // Same Google OAuth client as Drive/sign-in, its own grant and callback
    "google-sheets": {
      clientId: "GOOGLE_CLIENT_ID",
      clientSecret: "GOOGLE_CLIENT_SECRET",
    },
    calendly: {
      clientId: "CALENDLY_CLIENT_ID",
      clientSecret: "CALENDLY_CLIENT_SECRET",
    },
    slack: { clientId: "SLACK_CLIENT_ID", clientSecret: "SLACK_CLIENT_SECRET" },
    hubspot: {
      clientId: "HUBSPOT_CLIENT_ID",
      clientSecret: "HUBSPOT_CLIENT_SECRET",
    },
    mailchimp: {
      clientId: "MAILCHIMP_CLIENT_ID",
      clientSecret: "MAILCHIMP_CLIENT_SECRET",
    },
  };

  const mapping = envMappings[slug];
  if (!mapping) {
    throw new Error(`Unknown integration: ${slug}`);
  }

  const clientId = env[mapping.clientId];
  const clientSecret = env[mapping.clientSecret];
  const redirectUri = mapping.redirectUri
    ? env[mapping.redirectUri]
    : getIntegrationRedirectUri(slug);

  if (!(clientId && clientSecret && redirectUri)) {
    const required = [
      mapping.clientId,
      mapping.clientSecret,
      mapping.redirectUri,
    ].filter(Boolean);
    throw new Error(
      `Missing environment variables for ${slug} integration. Required: ${required.join(", ")}`
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

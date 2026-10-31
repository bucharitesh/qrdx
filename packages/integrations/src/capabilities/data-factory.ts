/**
 * Server-side helpers for content sources (Stripe, Cal.com, Calendly,
 * Shopify, YouTube, Spotify) and data-out sinks (Google Sheets, Slack,
 * HubSpot, Mailchimp): build a client from a stored integration, verify
 * pasted keys, read account details after OAuth, revoke on disconnect.
 */
import {
  createCalcomClient,
} from "../integrations/calcom/client";
import {
  createCalendlyClient,
  revokeCalendlyToken,
} from "../integrations/calendly/client";
import { revokeGoogleToken } from "../integrations/google-sheets/client";
import { revokeHubSpotToken } from "../integrations/hubspot/client";
import { getMailchimpMetadata } from "../integrations/mailchimp/client";
import {
  createShopifyClient,
  mintShopifyToken,
  normalizeShopDomain,
} from "../integrations/shopify/client";
import { readSlackInstall, revokeSlackToken } from "../integrations/slack/client";
import {
  createSpotifyPlaylistsClient,
} from "../integrations/spotify/client";
import {
  createStripeClient,
  isStripeTestKey,
} from "../integrations/stripe/client";
import { createYouTubeChannelClient } from "../integrations/youtube/client";
import { IntegrationApiError } from "../core/http-client";
import type { ContentSourceClient, ContentSourceSlug } from "../sources/types";

type Metadata = Record<string, unknown> | null | undefined;

const str = (metadata: Metadata, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : undefined;
};

/** Server-configured credentials for the optional media sources. */
export interface MediaSourceEnv {
  youtubeApiKey?: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
}

export function isMediaSourceConfigured(
  provider: "youtube" | "spotify",
  env: MediaSourceEnv
): boolean {
  return provider === "youtube"
    ? Boolean(env.youtubeApiKey)
    : Boolean(env.spotifyClientId && env.spotifyClientSecret);
}

/**
 * Client for a connected source. `query` names the channel/profile for the
 * YouTube and Spotify sources, which need no connection.
 */
export function createContentSourceClient(
  provider: ContentSourceSlug,
  options: {
    accessToken?: string;
    metadata?: Metadata;
    query?: string;
    env?: MediaSourceEnv;
  }
): ContentSourceClient {
  const missing = () =>
    new IntegrationApiError({
      provider,
      status: 401,
      code: "unauthorized",
      message: "Connect the account first.",
    });
  switch (provider) {
    case "stripe":
      if (!options.accessToken) throw missing();
      return createStripeClient(options.accessToken);
    case "calcom":
      if (!options.accessToken) throw missing();
      return createCalcomClient(options.accessToken, {
        username: str(options.metadata, "username") ?? undefined,
      });
    case "calendly":
      if (!options.accessToken) throw missing();
      return createCalendlyClient(options.accessToken, {
        userUri: str(options.metadata, "userUri"),
      });
    case "shopify": {
      const shop = str(options.metadata, "shop");
      if (!(options.accessToken && shop)) throw missing();
      return createShopifyClient(shop, options.accessToken, {
        storefrontOrigin: str(options.metadata, "storefrontOrigin"),
      });
    }
    case "youtube": {
      const key = options.env?.youtubeApiKey;
      if (!key) throw notConfigured(provider);
      return createYouTubeChannelClient(key, options.query ?? "");
    }
    case "spotify": {
      const clientId = options.env?.spotifyClientId;
      const clientSecret = options.env?.spotifyClientSecret;
      if (!(clientId && clientSecret)) throw notConfigured(provider);
      return createSpotifyPlaylistsClient(
        { clientId, clientSecret },
        options.query ?? ""
      );
    }
  }
}

function notConfigured(provider: string) {
  return new IntegrationApiError({
    provider,
    status: 503,
    code: "server",
    message: "Not configured on this server.",
  });
}

/** What a pasted-key connection stores. */
export interface VerifiedCredentials {
  accessToken: string;
  /** Encrypted by the caller like the access token */
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
  metadata: Record<string, unknown>;
}

export type SourceKeyInput =
  | { provider: "stripe"; apiKey: string }
  | { provider: "calcom"; apiKey: string }
  | {
      provider: "shopify";
      shop: string;
      accessToken?: string;
      clientId?: string;
      clientSecret?: string;
    };

/**
 * Checks pasted credentials with one read call and returns what to store.
 * Throws IntegrationApiError when the provider rejects them.
 */
export async function verifyContentSourceCredentials(
  input: SourceKeyInput
): Promise<VerifiedCredentials> {
  switch (input.provider) {
    case "stripe": {
      const { testMode } = await createStripeClient(input.apiKey).verify();
      return {
        accessToken: input.apiKey,
        scopes: "payment_links:read",
        metadata: {
          name: testMode ? "Stripe (test mode)" : "Stripe",
          testMode,
          keyHint: `${input.apiKey.slice(0, 8)}…${input.apiKey.slice(-4)}`,
          connectedWith: "restricted-key",
        },
      };
    }
    case "calcom": {
      const me = await createCalcomClient(input.apiKey).getMe();
      return {
        accessToken: input.apiKey,
        metadata: {
          name: me.username ? `cal.com/${me.username}` : (me.name ?? "Cal.com"),
          username: me.username,
          connectedWith: "api-key",
          testMode: !input.apiKey.startsWith("cal_live_"),
        },
      };
    }
    case "shopify": {
      const shop = normalizeShopDomain(input.shop);
      if (!shop) {
        throw new IntegrationApiError({
          provider: "shopify",
          status: 400,
          code: "bad_request",
          message: "Enter your store's myshopify.com domain.",
        });
      }
      let accessToken = input.accessToken;
      let expiresAt: Date | null = null;
      let refreshToken: string | null = null;
      let scopes: string | null = "read_products";
      if (!accessToken) {
        if (!(input.clientId && input.clientSecret)) {
          throw new IntegrationApiError({
            provider: "shopify",
            status: 400,
            code: "bad_request",
            message: "Paste an access token, or the app's client ID and secret.",
          });
        }
        const minted = await mintShopifyToken({
          shop,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
        });
        accessToken = minted.accessToken;
        expiresAt = minted.expiresAt;
        scopes = minted.scope ?? scopes;
        // Kept (encrypted) to renew the 24-hour token.
        refreshToken = JSON.stringify({
          clientId: input.clientId,
          clientSecret: input.clientSecret,
        });
      }
      const client = createShopifyClient(shop, accessToken);
      const info = await client.getShop();
      return {
        accessToken,
        refreshToken,
        // Not the expires_at column: core/token-refresh would try an OAuth
        // refresh. QRdx renews it from metadata.tokenExpiresAt instead.
        expiresAt: null,
        scopes,
        metadata: {
          name: info.name,
          shop,
          storefrontOrigin: info.primaryDomain?.url ?? `https://${shop}`,
          connectedWith: refreshToken ? "client-credentials" : "access-token",
          tokenExpiresAt: expiresAt?.toISOString() ?? null,
        },
      };
    }
  }
}

/** A fresh Shopify token for client-credentials connections. */
export async function renewShopifyToken(
  shop: string,
  storedCredentials: string
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const parsed = JSON.parse(storedCredentials) as {
    clientId?: string;
    clientSecret?: string;
  };
  if (!(parsed.clientId && parsed.clientSecret)) {
    throw new IntegrationApiError({
      provider: "shopify",
      status: 401,
      code: "unauthorized",
      message: "Shopify credentials are missing. Reconnect Shopify.",
    });
  }
  return mintShopifyToken({
    shop,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
  });
}

/** True when a client-credentials Shopify token expires within 10 minutes. */
export function shopifyTokenNeedsRenewal(metadata: Metadata): boolean {
  const at = str(metadata, "tokenExpiresAt");
  return Boolean(at && Date.parse(at) - Date.now() < 10 * 60_000);
}

/**
 * Account details saved after OAuth for this module's providers (null for
 * any other provider). Never stores tokens or the person's email.
 */
export async function fetchDataAccountMetadata(
  provider: string,
  accessToken: string,
  tokenResponse?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  switch (provider) {
    case "calendly": {
      const user = await createCalendlyClient(accessToken).getCurrentUser();
      return {
        name: user.name ?? "Calendly",
        userUri: user.uri,
        schedulingUrl: user.scheduling_url,
      };
    }
    case "hubspot": {
      const hubId = tokenResponse?.hub_id;
      return {
        name: hubId ? `HubSpot account ${hubId}` : "HubSpot",
        hubId: typeof hubId === "number" || typeof hubId === "string" ? hubId : null,
      };
    }
    case "mailchimp": {
      const meta = await getMailchimpMetadata(accessToken);
      return { name: meta.accountname ?? "Mailchimp", dc: meta.dc };
    }
    case "google-sheets":
      return { name: "Google Sheets" };
    case "slack": {
      const install = readSlackInstall(tokenResponse);
      return {
        name: install.teamName ?? "Slack",
        teamId: install.teamId,
        teamName: install.teamName,
      };
    }
    default:
      return null;
  }
}

/** This module's providers with a revoke API. */
export const DATA_REVOCABLE_PROVIDERS = [
  "calendly",
  "google-sheets",
  "hubspot",
  "slack",
] as const;

/**
 * Revokes the token where the provider supports it (Mailchimp, Stripe,
 * Cal.com and Shopify keys have no revoke API: the person deletes the key
 * or app in the provider). Returns false when nothing was revoked.
 */
export async function revokeDataProviderToken(
  provider: string,
  tokens: { accessToken: string; refreshToken?: string | null },
  client?: { clientId: string; clientSecret: string }
): Promise<boolean> {
  switch (provider) {
    case "calendly":
      if (!client) return false;
      await revokeCalendlyToken({
        token: tokens.refreshToken ?? tokens.accessToken,
        ...client,
      });
      return true;
    case "google-sheets":
      await revokeGoogleToken(tokens.refreshToken ?? tokens.accessToken);
      return true;
    case "hubspot":
      if (!(client && tokens.refreshToken)) return false;
      await revokeHubSpotToken({ token: tokens.refreshToken, ...client });
      return true;
    case "slack":
      await revokeSlackToken(tokens.accessToken);
      return true;
    default:
      return false;
  }
}

export { isStripeTestKey };

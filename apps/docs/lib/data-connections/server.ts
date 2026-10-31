import "server-only";

import {
  database as db,
  integration,
  notificationSetting,
} from "@repo/database";
import {
  CONTENT_SOURCE_CONTENT_TYPES,
  type ContentSourceSlug,
  contentSourcesFor,
  createContentSourceClient,
  encryptApiKey,
  fetchDataAccountMetadata,
  getIntegrationRegistry,
  type Integration,
  isContentSourceProvider,
  isMediaSourceConfigured,
  type MediaSourceEnv,
  readSlackInstall,
  renewShopifyToken,
  revokeDataProviderToken,
  type SourceKeyInput,
  type SourcePage,
  shopifyTokenNeedsRenewal,
  verifyContentSourceCredentials,
} from "@repo/integrations";
import { and, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { getConnection, getIntegrationConfig } from "@/lib/connected-accounts/server";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/error-response";
import { addChatTarget } from "@/lib/events/notification-settings";
import { invalidateSubscribers } from "@/lib/events/subscribers";
import { isIntegrationConfigured, isOAuthConfigured } from "@/lib/integration-oauth";
import { getActiveScope } from "@/lib/scope";

// Content sources and data out, app side: fresh connections, source
// listings, pasted-key connections, the OAuth post-connect step (Slack) and
// disconnect cleanup. Provider clients live in @repo/integrations.

/**
 * Local dev and previews share the production database, so calls to people's
 * connected tools follow the delivery guard: off unless QRDX_ALLOW_DEV_DELIVERY=1.
 */
export const dataCallsAllowed = isOutboundDeliveryAllowed;

export const DEV_DISABLED_MESSAGE =
  "Calls to connected tools are off outside production. Set QRDX_ALLOW_DEV_DELIVERY=1 to try them, or open the page with ?integrations-mock=1 for sample data.";

export function devDisabled(): HttpError {
  return new HttpError(503, "DEV_DISABLED", DEV_DISABLED_MESSAGE);
}

export function mediaSourceEnv(): MediaSourceEnv {
  return {
    youtubeApiKey: env.YOUTUBE_API_KEY,
    spotifyClientId: env.SPOTIFY_CLIENT_ID,
    spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET,
  };
}

/**
 * The stored connection with a usable token: OAuth tokens refresh in
 * core/token-refresh; Shopify client-credentials tokens are re-minted here.
 */
export async function getFreshConnection(
  userId: string,
  provider: string,
): Promise<Integration | null> {
  const connection = await getConnection(userId, provider);
  if (!connection || connection.status !== "active") return connection;
  if (
    provider === "shopify" &&
    connection.refreshToken &&
    shopifyTokenNeedsRenewal(connection.metadata)
  ) {
    const shop = String(connection.metadata?.shop ?? "");
    const renewed = await renewShopifyToken(shop, connection.refreshToken);
    const metadata = {
      ...connection.metadata,
      tokenExpiresAt: renewed.expiresAt?.toISOString() ?? null,
    };
    await db
      .update(integration)
      .set({
        accessToken: encryptApiKey(renewed.accessToken),
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(integration.id, connection.id));
    return { ...connection, accessToken: renewed.accessToken, metadata };
  }
  return connection;
}

export interface SourceStatus {
  slug: ContentSourceSlug;
  name: string;
  logo: string;
  /** App credentials (OAuth) or server keys (YouTube/Spotify) present */
  configured: boolean;
  /** No connection needed; the person names a channel/profile instead */
  needsQuery: boolean;
  connected: boolean;
  status: "active" | "disconnected" | "error" | null;
}

/** Sources for an editor content type with their state for this person. */
export async function getSourceStatuses(
  userId: string | null,
  contentType: string,
): Promise<SourceStatus[]> {
  const slugs = contentSourcesFor(contentType);
  const rows =
    userId && slugs.length > 0
      ? await db
          .select({ provider: integration.provider, status: integration.status })
          .from(integration)
          .where(
            and(
              eq(integration.userId, userId),
              inArray(integration.provider, slugs),
            ),
          )
      : [];
  const status = new Map(rows.map((row) => [row.provider, row.status]));
  const registry = getIntegrationRegistry();
  const media = mediaSourceEnv();
  return slugs.flatMap((slug) => {
    const definition = registry.get(slug);
    if (!definition) return [];
    const needsQuery = slug === "youtube" || slug === "spotify";
    const configured = needsQuery
      ? isMediaSourceConfigured(slug, media)
      : definition.type === "oauth"
        ? isOAuthConfigured(slug)
        : isIntegrationConfigured(slug);
    return [
      {
        slug,
        name: definition.name,
        logo: definition.logos.light,
        configured,
        needsQuery,
        connected: needsQuery ? configured : status.has(slug),
        status: needsQuery
          ? null
          : ((status.get(slug) as SourceStatus["status"]) ?? null),
      },
    ];
  });
}

/** One page of a source's items. Throws HttpError / IntegrationApiError. */
export async function listSourceItems(
  userId: string,
  provider: string,
  options: { cursor?: string; search?: string; query?: string },
): Promise<SourcePage> {
  if (!isContentSourceProvider(provider)) {
    throw new HttpError(404, "NOT_FOUND", "Not a content source.");
  }
  if (!dataCallsAllowed()) throw devDisabled();
  const needsQuery = provider === "youtube" || provider === "spotify";
  if (needsQuery) {
    if (!isMediaSourceConfigured(provider, mediaSourceEnv())) {
      throw new HttpError(503, "NOT_CONFIGURED", "Not configured on this server.");
    }
    return createContentSourceClient(provider, {
      query: options.query,
      env: mediaSourceEnv(),
    }).list(options);
  }
  const connection = await getFreshConnection(userId, provider);
  const name = getIntegrationRegistry().get(provider)?.name ?? provider;
  if (!connection) {
    throw new HttpError(404, "NOT_CONNECTED", `${name} isn't connected.`);
  }
  if (connection.status !== "active") {
    throw new HttpError(
      409,
      "RECONNECT",
      `Reconnect ${name} in Settings → Integrations.`,
    );
  }
  return createContentSourceClient(provider, {
    accessToken: connection.accessToken,
    metadata: connection.metadata,
  }).list(options);
}

/** Saves a pasted-key connection after the provider accepted it. */
export async function saveKeyConnection(
  userId: string,
  input: SourceKeyInput,
): Promise<void> {
  if (!dataCallsAllowed()) throw devDisabled();
  const verified = await verifyContentSourceCredentials(input);
  const values = {
    accessToken: encryptApiKey(verified.accessToken),
    refreshToken: verified.refreshToken
      ? encryptApiKey(verified.refreshToken)
      : null,
    expiresAt: verified.expiresAt ?? null,
    scopes: verified.scopes ?? null,
    metadata: verified.metadata,
    status: "active",
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: integration.id })
    .from(integration)
    .where(
      and(eq(integration.userId, userId), eq(integration.provider, input.provider)),
    )
    .limit(1);
  if (existing) {
    await db.update(integration).set(values).where(eq(integration.id, existing.id));
  } else {
    await db.insert(integration).values({
      id: crypto.randomUUID(),
      userId,
      provider: input.provider,
      createdAt: new Date(),
      ...values,
    });
  }
}

// ─── OAuth post-connect (called by the generic callback) ────────────────────

const SLACK_SCOPE_COOKIE = "slack_install_workspace";
const SLACK_DEFAULT_EVENTS = ["scan.milestone", "form.submitted"] as const;
const MAX_SLACK_CHANNELS = 20;

/** "Add to Slack" from a workspace: remember which one (10 minutes). */
export async function rememberSlackWorkspace(organizationId: string | null) {
  (await cookies()).set(SLACK_SCOPE_COOKIE, organizationId ?? "personal", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
}

async function takeSlackWorkspace(): Promise<string | null | undefined> {
  const store = await cookies();
  const value = store.get(SLACK_SCOPE_COOKIE)?.value;
  store.delete(SLACK_SCOPE_COOKIE);
  if (!value) return undefined;
  return value === "personal" ? null : value.slice(0, 64);
}

export interface SlackChannelRecord {
  targetId: string;
  channel: string;
  teamName: string | null;
  organizationId: string | null;
  addedAt: string;
}

export function readSlackChannels(metadata: unknown): SlackChannelRecord[] {
  const list = (metadata as { channels?: unknown } | null)?.channels;
  return Array.isArray(list)
    ? list.filter(
        (item): item is SlackChannelRecord =>
          typeof item?.targetId === "string" && typeof item?.channel === "string",
      )
    : [];
}

export type DataConnectOutcome =
  | { handled: false }
  | { handled: true; metadata: Record<string, unknown>; redirect: string }
  | { handled: true; error: string; redirect: string };

const DATA_OAUTH_PROVIDERS = new Set([
  "calendly",
  "google-sheets",
  "slack",
  "hubspot",
  "mailchimp",
]);

/**
 * Runs right after the token exchange, before the row is saved. Slack: the
 * channel webhook becomes a notification target in the chosen workspace
 * (same alerts and formatting as a pasted webhook). Everyone: account
 * metadata without tokens or the person's email.
 */
export async function prepareDataConnect(
  provider: string,
  tokenData: Record<string, unknown>,
  userId: string,
): Promise<DataConnectOutcome> {
  if (!DATA_OAUTH_PROVIDERS.has(provider)) return { handled: false };
  const detail = `/settings/integrations/${provider}`;
  try {
    if (provider === "slack") {
      const install = readSlackInstall(tokenData);
      const remembered = await takeSlackWorkspace();
      const organizationId =
        remembered === undefined
          ? (await getActiveScope()).organizationId
          : remembered;
      const { id } = await addChatTarget(userId, organizationId, {
        channel: "slack",
        url: install.webhookUrl,
        events: [...SLACK_DEFAULT_EVENTS],
      });
      const [existing] = await db
        .select({ metadata: integration.metadata })
        .from(integration)
        .where(and(eq(integration.userId, userId), eq(integration.provider, "slack")))
        .limit(1);
      const channels: SlackChannelRecord[] = [
        ...readSlackChannels(existing?.metadata),
        {
          targetId: id,
          channel: install.channel,
          teamName: install.teamName,
          organizationId,
          addedAt: new Date().toISOString(),
        },
      ].slice(-MAX_SLACK_CHANNELS);
      return {
        handled: true,
        metadata: {
          name: install.teamName ?? "Slack",
          teamId: install.teamId,
          teamName: install.teamName,
          channels,
        },
        redirect: `${detail}?success=slack_connected`,
      };
    }
    const accessToken = String(tokenData.access_token ?? "");
    let metadata: Record<string, unknown> | null = null;
    if (dataCallsAllowed()) {
      metadata = await fetchDataAccountMetadata(provider, accessToken, tokenData);
    } else if (provider === "mailchimp") {
      // The data center is needed for every Mailchimp call.
      return { handled: true, error: "dev_disabled", redirect: detail };
    }
    return {
      handled: true,
      metadata: metadata ?? {},
      redirect: `${detail}?success=${provider}_connected`,
    };
  } catch (error) {
    const code =
      error instanceof HttpError
        ? error.code === "PLAN_REQUIRED"
          ? "plan_required"
          : error.code === "LIMIT_REACHED"
            ? "limit_reached"
            : "unexpected_error"
        : "provider_rejected";
    console.error(
      JSON.stringify({
        event: "integrations.post_connect_failed",
        provider,
        code,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      }),
    );
    return { handled: true, error: code, redirect: detail };
  }
}

/**
 * Disconnect: revoke the token where the provider allows it (best effort),
 * and for Slack remove the channels it added. The caller deletes the row.
 */
export async function cleanupDataConnection(
  userId: string,
  provider: string,
): Promise<boolean> {
  if (!(DATA_OAUTH_PROVIDERS.has(provider) || isContentSourceProvider(provider))) {
    return false;
  }
  let revoked = false;
  try {
    const connection = await getConnection(userId, provider);
    if (!connection) return false;
    if (provider === "slack") {
      const channels = readSlackChannels(connection.metadata);
      const ids = channels.map((channel) => channel.targetId);
      if (ids.length > 0) {
        await db
          .delete(notificationSetting)
          .where(
            and(
              eq(notificationSetting.userId, userId),
              inArray(notificationSetting.id, ids),
            ),
          );
        for (const organizationId of new Set(channels.map((c) => c.organizationId))) {
          invalidateSubscribers({ userId, organizationId });
        }
      }
    }
    if (!dataCallsAllowed()) return false;
    let client: { clientId: string; clientSecret: string } | undefined;
    try {
      const config = getIntegrationConfig(provider);
      client = config.clientId
        ? { clientId: config.clientId, clientSecret: config.clientSecret }
        : undefined;
    } catch {
      client = undefined;
    }
    revoked = await revokeDataProviderToken(
      provider,
      { accessToken: connection.accessToken, refreshToken: connection.refreshToken },
      client,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "integrations.revoke_failed",
        provider,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      }),
    );
  }
  return revoked;
}

export { CONTENT_SOURCE_CONTENT_TYPES };

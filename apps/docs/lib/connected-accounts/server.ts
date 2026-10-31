import "server-only";

import { auth } from "@repo/auth/server";
import { database as db, integration } from "@repo/database";
import {
  createFilePickerClient,
  createShortLinkClient,
  type FilePickerClient,
  type FilePickerProviderSlug,
  getIntegration,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  type Integration,
  initializeIntegrations,
  isFilePickerProvider,
  isIntegrationApiError,
  isShortLinkProvider,
  revokeProviderToken,
  type ShortLinkClient,
  type ShortLinkProviderSlug,
} from "@repo/integrations";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";

initializeIntegrations();

/** Connect / disconnect / save-key actions: few per minute per user. */
export const connectLimiter = createRateLimiter({
  limiter: slidingWindow(10, "60 s"),
  prefix: "qrdx:integrations:connect",
});
/** Calls that create something in the provider (links, shared links). */
export const providerWriteLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
  prefix: "qrdx:integrations:write",
});
/** Browsing and listing. */
export const providerReadLimiter = createRateLimiter({
  limiter: slidingWindow(120, "60 s"),
  prefix: "qrdx:integrations:read",
});

export const getIntegrationConfig = (slug: string) =>
  getIntegrationConfigWithEnv(slug, env);

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/** The user's stored integration (token refreshed when close to expiry). */
export function getConnection(
  userId: string,
  provider: string,
): Promise<Integration | null> {
  return getIntegration(userId, provider, getIntegrationConfig);
}

/** Flags the row so settings offer "Reconnect" after the provider rejects it. */
async function markNeedsReconnect(userId: string, provider: string) {
  await db
    .update(integration)
    .set({ status: "error", updatedAt: new Date() })
    .where(
      and(eq(integration.userId, userId), eq(integration.provider, provider)),
    );
}

type Resolved<T> =
  | { ok: true; userId: string; client: T; connection: Integration }
  | { ok: false; response: Response };

const notConnected = (name: string) =>
  NextResponse.json(
    { error: `${name} isn't connected`, code: "not_connected" },
    { status: 404 },
  );

async function resolveConnection(
  provider: string,
  limiter: typeof providerReadLimiter,
): Promise<
  | { ok: true; userId: string; connection: Integration; name: string }
  | { ok: false; response: Response }
> {
  const definition = getIntegrationRegistry().get(provider);
  if (!definition) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unknown integration" },
        { status: 404 },
      ),
    };
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    await enforceRateLimits([
      { limiter, key: `integrations:${provider}:${userId}` },
    ]);
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: error.message, code: "rate_limited" },
          { status: 429, headers: error.headers },
        ),
      };
    }
    throw error;
  }

  const connection = await getConnection(userId, provider);
  if (!connection) {
    return { ok: false, response: notConnected(definition.name) };
  }
  if (connection.status !== "active") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Reconnect ${definition.name} in Settings → Integrations.`,
          code: "reconnect",
        },
        { status: 409 },
      ),
    };
  }
  return { ok: true, userId, connection, name: definition.name };
}

export async function resolveShortLinkClient(
  provider: string,
  limiter = providerReadLimiter,
): Promise<Resolved<ShortLinkClient> & { provider?: ShortLinkProviderSlug }> {
  if (!isShortLinkProvider(provider)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not a short-link integration" },
        { status: 404 },
      ),
    };
  }
  const resolved = await resolveConnection(provider, limiter);
  if (!resolved.ok) return resolved;
  return {
    ...resolved,
    provider,
    client: createShortLinkClient(provider, {
      accessToken: resolved.connection.accessToken,
      metadata: resolved.connection.metadata,
    }),
  };
}

export async function resolveFilePickerClient(
  provider: string,
  limiter = providerReadLimiter,
): Promise<Resolved<FilePickerClient> & { provider?: FilePickerProviderSlug }> {
  if (!isFilePickerProvider(provider)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not a file picker integration" },
        { status: 404 },
      ),
    };
  }
  const resolved = await resolveConnection(provider, limiter);
  if (!resolved.ok) return resolved;
  return {
    ...resolved,
    provider,
    client: createFilePickerClient(provider, resolved.connection.accessToken),
  };
}

/**
 * Revokes the stored token where the provider has a revoke API (Dropbox,
 * Box, Notion). Best effort: a failure never blocks deleting the row.
 */
export async function revokeStoredToken(
  userId: string,
  provider: string,
): Promise<boolean> {
  try {
    const connection = await getConnection(userId, provider);
    if (!connection) return false;
    let client: { clientId: string; clientSecret: string } | undefined;
    try {
      const config = getIntegrationConfig(provider);
      client = { clientId: config.clientId, clientSecret: config.clientSecret };
    } catch {
      client = undefined;
    }
    return await revokeProviderToken(
      provider,
      {
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
      },
      client,
    );
  } catch (error) {
    console.error(
      `[integrations] ${provider} token revoke failed:`,
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

/**
 * Turns a provider error into a response the editor can show. A 401 from the
 * provider becomes 409 "reconnect" (a 401 here would sign the user out).
 */
export async function providerErrorResponse(
  error: unknown,
  context: { userId: string; provider: string; action: string },
): Promise<Response> {
  if (isIntegrationApiError(error)) {
    if (error.code === "unauthorized") {
      await markNeedsReconnect(context.userId, context.provider).catch(
        () => undefined,
      );
      return NextResponse.json(
        { error: error.message, code: "reconnect" },
        { status: 409 },
      );
    }
    const status =
      error.code === "rate_limited"
        ? 429
        : error.code === "forbidden" || error.code === "upgrade_required"
          ? 403
          : error.code === "not_found"
            ? 404
            : error.code === "bad_request" || error.code === "conflict"
              ? 400
              : 502;
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status,
        headers:
          error.retryAfterSeconds !== undefined
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined,
      },
    );
  }

  // Never log tokens: only the provider, the action and the error message
  console.error(
    `[integrations] ${context.provider} ${context.action} failed:`,
    error instanceof Error ? error.message : "unknown error",
  );
  return NextResponse.json(
    { error: "Something went wrong. Try again." },
    { status: 500 },
  );
}

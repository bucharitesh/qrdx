import crypto from "node:crypto";
import { auth } from "@repo/auth/server";
import { database as db, integration } from "@repo/database";
import {
  createOAuthHandler,
  encryptApiKey,
  fetchConnectedAccountMetadata,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prepareDataConnect } from "@/lib/data-connections/server";
import { env } from "@/lib/env";
import {
  consumeIntegrationOAuthState,
  takeIntegrationReturnPath,
} from "@/lib/integration-oauth";
import { returnUrl } from "@/lib/integration-return";

// Initialize integrations on module load
initializeIntegrations();

type RouteContext = {
  params: Promise<{ provider: string }>;
};

/**
 * Generic OAuth callback handler for all integrations
 * This handles the OAuth redirect after user authorizes the app
 */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Check if integration exists in registry
  const registry = getIntegrationRegistry();
  const integrationDef = registry.get(provider);

  // Where the flow started (e.g. the Import dialog's `?import=<provider>`), a
  // same-site path from an httpOnly cookie; otherwise Settings → Integrations.
  const returnTo = integrationDef
    ? await takeIntegrationReturnPath(provider)
    : null;
  const fail = (reason: string) =>
    NextResponse.redirect(
      returnUrl(returnTo, request.url, {
        connect_error: /^[a-z_]{1,64}$/.test(reason) ? reason : "oauth_error",
      }) ??
        new URL(
          `/settings/integrations?error=${encodeURIComponent(reason)}`,
          request.url,
        ),
    );

  // Check for OAuth errors (access_denied when the user cancels)
  if (error) {
    return fail(error);
  }

  if (!code) {
    return fail("no_code");
  }

  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return fail("unauthorized");
  }

  if (!integrationDef) {
    return fail("unknown_integration");
  }

  // Verify state (CSRF) and retrieve the PKCE verifier; both cookies are cleared
  const oauthState = await consumeIntegrationOAuthState(provider, state);

  if ("error" in oauthState) {
    return fail(oauthState.error);
  }

  const { codeVerifier } = oauthState;

  try {
    // Get integration config with environment credentials
    const config = getIntegrationConfigWithEnv(provider, env);

    // Create OAuth handler
    const oauthHandler = createOAuthHandler(config);

    // Exchange authorization code for access token
    const tokenData = await oauthHandler.exchangeCodeForTokens(
      code,
      codeVerifier,
    );

    // Content sources / data out: Slack's channel webhook, account details
    const dataConnect = await prepareDataConnect(
      provider,
      tokenData as unknown as Record<string, unknown>,
      session.user.id,
    );
    if (dataConnect.handled && "error" in dataConnect) {
      return NextResponse.redirect(
        new URL(
          `${dataConnect.redirect}?error=${dataConnect.error}`,
          request.url,
        ),
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiration timestamp
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    // Encrypt tokens
    const encryptedAccessToken = encryptApiKey(access_token);
    const encryptedRefreshToken = refresh_token
      ? encryptApiKey(refresh_token)
      : null;

    // Fetch provider-specific metadata
    let metadata = null;
    try {
      metadata =
        "metadata" in dataConnect
          ? dataConnect.metadata
          : await fetchProviderMetadata(provider, access_token, tokenData);
    } catch (error) {
      console.error(`Failed to fetch ${provider} metadata:`, error);
    }

    // Build scopes string
    const scopes = tokenData.scope || config.oauth?.scopes.join(" ");

    // Check if integration already exists
    const existingIntegration = await db
      .select()
      .from(integration)
      .where(
        and(
          eq(integration.userId, session.user.id),
          eq(integration.provider, provider),
        ),
      )
      .limit(1);

    if (existingIntegration.length > 0) {
      // Update existing integration
      await db
        .update(integration)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          scopes,
          metadata,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(integration.id, existingIntegration[0].id));
    } else {
      // Create new integration
      await db.insert(integration).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        provider,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scopes,
        metadata,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (dataConnect.handled) {
      return NextResponse.redirect(new URL(dataConnect.redirect, request.url));
    }

    // Back where the flow started, else the integrations page with success
    return NextResponse.redirect(
      returnUrl(returnTo, request.url) ??
        new URL(
          `/settings/integrations?success=${provider}_connected`,
          request.url,
        ),
    );
  } catch (error) {
    console.error(`[${provider}] OAuth callback error:`, error);
    return fail("unexpected_error");
  }
}

/**
 * Fetch provider-specific metadata after successful OAuth
 */
async function fetchProviderMetadata(
  provider: string,
  accessToken: string,
  tokenData?: object,
): Promise<any> {
  switch (provider) {
    case "dub": {
      const response = await fetch("https://api.dub.co/workspaces", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const workspaces = await response.json();
        return { workspace: workspaces[0] }; // Get first workspace
      }
      return null;
    }

    case "google-drive": {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (response.ok) {
        return await response.json();
      }
      return null;
    }

    // Short links and file pickers: account name/email (Notion: from the token response)
    case "bitly":
    case "dropbox":
    case "onedrive":
    case "box":
    case "notion":
      return fetchConnectedAccountMetadata(
        provider,
        accessToken,
        tokenData as Record<string, unknown> | undefined,
      );

    default:
      return null;
  }
}

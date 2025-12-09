import { db, integration } from "@repo/database";
import {
  createOAuthHandler,
  encryptApiKey,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

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
  const error = searchParams.get("error");

  // Check for OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?error=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=no_code", request.url),
    );
  }

  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=unauthorized", request.url),
    );
  }

  // Check if integration exists in registry
  const registry = getIntegrationRegistry();
  const integrationDef = registry.get(provider);

  if (!integrationDef) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=unknown_integration`, request.url),
    );
  }

  // Retrieve code verifier from cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get(`${provider}_code_verifier`)?.value;

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=missing_verifier", request.url),
    );
  }

  // Delete the code verifier cookie
  cookieStore.delete(`${provider}_code_verifier`);

  try {
    // Get integration config with environment credentials
    const config = getIntegrationConfigWithEnv(provider, env);

    // Create OAuth handler
    const oauthHandler = createOAuthHandler(config);

    console.log(`[${provider}] Exchanging code for tokens...`);

    // Exchange authorization code for access token
    const tokenData = await oauthHandler.exchangeCodeForTokens(
      code,
      codeVerifier,
    );

    console.log(`[${provider}] Token exchange successful`);
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
      metadata = await fetchProviderMetadata(provider, access_token);
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

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?success=${provider}_connected`,
        request.url,
      ),
    );
  } catch (error) {
    console.error(`[${provider}] OAuth callback error:`, error);
    return NextResponse.redirect(
      new URL("/settings/integrations?error=unexpected_error", request.url),
    );
  }
}

/**
 * Fetch provider-specific metadata after successful OAuth
 */
async function fetchProviderMetadata(
  provider: string,
  accessToken: string,
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

    default:
      return null;
  }
}


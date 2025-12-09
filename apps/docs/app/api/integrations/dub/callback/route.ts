import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { db, integration } from "@repo/database";
import { auth } from "@/lib/auth";
import {
  encryptApiKey,
} from "@/lib/integrations/encryption";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { createOAuthHandler } from "@/lib/integrations/oauth";

/**
 * OAuth callback handler for Dub.sh
 * This handles the OAuth redirect after user authorizes the app
 */
export async function GET(request: Request) {
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

  // Retrieve code verifier from cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("dub_code_verifier")?.value;

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=missing_verifier", request.url),
    );
  }

  // Delete the code verifier cookie
  cookieStore.delete("dub_code_verifier");

  try {
    // Get Dub integration config and create OAuth handler
    const config = getIntegrationConfig("dub");
    const oauthHandler = createOAuthHandler(config);

    console.log("Exchanging code for tokens...");

    // Exchange authorization code for access token using generic handler
    const tokenData = await oauthHandler.exchangeCodeForTokens(code, codeVerifier);

    console.log("Token exchange successful");
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

    // Fetch workspace info from Dub.sh
    let workspaceInfo = null;
    try {
      const workspaceResponse = await fetch("https://api.dub.co/workspaces", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      if (workspaceResponse.ok) {
        const workspaces = await workspaceResponse.json();
        workspaceInfo = workspaces[0]; // Get first workspace
      }
    } catch (error) {
      console.error("Failed to fetch workspace info:", error);
    }

    // Build scopes string
    const scopes = tokenData.scope || config.scopes.join(" ");

    // Check if integration already exists
    const existingIntegration = await db
      .select()
      .from(integration)
      .where(
        and(
          eq(integration.userId, session.user.id),
          eq(integration.provider, "dub"),
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
          metadata: workspaceInfo,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(integration.id, existingIntegration[0].id));
    } else {
      // Create new integration
      await db.insert(integration).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        provider: "dub",
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scopes,
        metadata: workspaceInfo,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      new URL("/settings/integrations?success=dub_connected", request.url),
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/settings/integrations?error=unexpected_error", request.url),
    );
  }
}

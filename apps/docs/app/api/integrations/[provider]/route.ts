import { db, integration } from "@repo/database";
import {
  createOAuthHandler,
  generatePKCE,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
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

// GET - Check if user has integration connected OR initiate OAuth
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if integration exists in registry
    const registry = getIntegrationRegistry();
    const integrationDef = registry.get(provider);

    if (!integrationDef) {
      return NextResponse.json(
        { error: `Unknown integration: ${provider}` },
        { status: 404 },
      );
    }

    // If action is "connect", initiate OAuth flow
    if (action === "connect") {
      try {
        const config = getIntegrationConfigWithEnv(provider, env);

        // Generate PKCE parameters
        const { codeVerifier, codeChallenge, codeChallengeMethod } =
          generatePKCE();

        // Store code verifier in a secure cookie
        const cookieStore = await cookies();
        cookieStore.set(`${provider}_code_verifier`, codeVerifier, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 600, // 10 minutes
          path: "/",
        });

        // Create OAuth handler and generate auth URL
        const oauthHandler = createOAuthHandler(config);
        const authUrl = oauthHandler.generateAuthUrl(codeVerifier);

        return NextResponse.json({ url: authUrl });
      } catch (error) {
        console.error(`Failed to initiate OAuth for ${provider}:`, error);
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : `Failed to initiate ${integrationDef.name} connection`,
          },
          { status: 500 },
        );
      }
    }

    // Otherwise, return connection status
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

    return NextResponse.json({
      connected: existingIntegration.length > 0,
      connectedAt: existingIntegration[0]?.createdAt,
      metadata: existingIntegration[0]?.metadata,
      status: existingIntegration[0]?.status,
    });
  } catch (error) {
    console.error(`Error fetching ${provider} integration:`, error);
    return NextResponse.json(
      { error: "Failed to fetch integration status" },
      { status: 500 },
    );
  }
}

// DELETE - Disconnect integration
export async function DELETE(request: Request, context: RouteContext) {
  const { provider } = await context.params;

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if integration exists in registry
    const registry = getIntegrationRegistry();
    const integrationDef = registry.get(provider);

    if (!integrationDef) {
      return NextResponse.json(
        { error: `Unknown integration: ${provider}` },
        { status: 404 },
      );
    }

    await db
      .delete(integration)
      .where(
        and(
          eq(integration.userId, session.user.id),
          eq(integration.provider, provider),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error disconnecting ${provider}:`, error);
    return NextResponse.json(
      { message: `Failed to disconnect ${provider}` },
      { status: 500 },
    );
  }
}


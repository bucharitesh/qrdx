import { auth } from "@repo/auth/server";
import { database as db, integration } from "@repo/database";
import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { cleanupDataConnection } from "@/lib/data-connections/server";
import {
  connectLimiter,
  revokeStoredToken,
} from "@/lib/connected-accounts/server";
import { HttpError } from "@/lib/error-response";
import {
  createIntegrationAuthUrl,
  isOAuthConfigured,
} from "@/lib/integration-oauth";
import { enforceRateLimits } from "@/lib/request-guards";

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
      if (!isOAuthConfigured(provider)) {
        return NextResponse.json(
          { error: `${integrationDef.name} is not configured on this server` },
          { status: 503 },
        );
      }

      try {
        await enforceRateLimits([
          {
            limiter: connectLimiter,
            key: `integrations:oauth:${session.user.id}`,
          },
        ]);
      } catch (error) {
        if (error instanceof HttpError) {
          return NextResponse.json(
            { error: error.message },
            { status: 429, headers: error.headers },
          );
        }
        throw error;
      }

      try {
        const authUrl = await createIntegrationAuthUrl(provider);
        return NextResponse.json({ url: authUrl });
      } catch (error) {
        console.error(`Failed to initiate OAuth for ${provider}:`, error);
        return NextResponse.json(
          { error: `Failed to initiate ${integrationDef.name} connection` },
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
export async function DELETE(_request: Request, context: RouteContext) {
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

    // Revoke at the provider where its API allows it, then delete the row
    await revokeStoredToken(session.user.id, provider);
    await cleanupDataConnection(session.user.id, provider);
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

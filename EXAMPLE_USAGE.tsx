/**
 * Example Usage: Integration System with Dub.sh
 *
 * This file demonstrates how to use the new integrations system
 * in various scenarios within your Next.js application.
 */

// ============================================================================
// Example 1: Server Action - Create Short Link
// ============================================================================

"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDubClient } from "@/lib/integrations/providers/dub/client";

export async function createShortLinkAction(url: string) {
  // Get authenticated user
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  // Get Dub client - automatically handles token refresh!
  const dub = await getDubClient(session.user.id);

  // Create short link using Dub SDK
  const link = await dub.links.create({
    url,
    domain: "dub.sh",
  });

  return link;
}

// ============================================================================
// Example 2: API Route - Get Link Analytics
// ============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLinkAnalytics } from "@/lib/integrations/providers/dub/utils";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get("linkId");

  if (!linkId) {
    return NextResponse.json({ error: "linkId required" }, { status: 400 });
  }

  try {
    const analytics = await getLinkAnalytics(session.user.id, linkId, {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      end: new Date(),
    });

    return NextResponse.json({ analytics });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not connected")) {
      return NextResponse.json(
        { error: "Dub integration not connected" },
        { status: 400 }
      );
    }
    throw error;
  }
}

// ============================================================================
// Example 3: React Server Component - Display User's Links
// ============================================================================

import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasIntegration } from "@/lib/integrations/manager";
import { getDubClient } from "@/lib/integrations/providers/dub/client";

export default async function LinksPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return <div>Please log in</div>;
  }

  // Check if user has Dub integration connected
  const isConnected = await hasIntegration(session.user.id, "dub");

  if (!isConnected) {
    return (
      <div>
        <h1>Connect Dub.sh</h1>
        <p>Connect your Dub.sh account to manage short links.</p>
        <Link href="/settings/integrations">
          <button>Connect Dub.sh</button>
        </Link>
      </div>
    );
  }

  // Get Dub client and fetch links
  const dub = await getDubClient(session.user.id);
  const links = await dub.links.list();

  return (
    <div>
      <h1>Your Short Links</h1>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <a href={link.shortLink}>{link.shortLink}</a> → {link.url}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Example 4: Server Action - Bulk Create Links
// ============================================================================

export async function bulkCreateLinksAction(urls: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const dub = await getDubClient(session.user.id);

  // Create multiple links
  const links = await Promise.all(
    urls.map((url) =>
      dub.links.create({
        url,
        domain: "dub.sh",
      })
    )
  );

  return links;
}

// ============================================================================
// Example 5: Check Integration Status
// ============================================================================

import { getIntegration } from "@/lib/integrations/manager";

export async function getIntegrationStatusAction() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const integration = await getIntegration(session.user.id, "dub");

  if (!integration) {
    return {
      connected: false,
      status: null,
    };
  }

  return {
    connected: true,
    status: integration.status,
    lastSync: integration.lastSyncAt,
    workspace: integration.metadata?.workspace,
  };
}

// ============================================================================
// Example 6: Disconnect Integration
// ============================================================================

import { disconnectIntegration } from "@/lib/integrations/manager";

export async function disconnectDubAction() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  await disconnectIntegration(session.user.id, "dub");

  return { success: true };
}

// ============================================================================
// Example 7: List All User Integrations
// ============================================================================

import { listUserIntegrations } from "@/lib/integrations/manager";

export async function getUserIntegrationsAction() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const integrations = await listUserIntegrations(session.user.id);

  return integrations.map((integration) => ({
    provider: integration.provider,
    status: integration.status,
    lastSync: integration.lastSyncAt,
    createdAt: integration.createdAt,
  }));
}

// ============================================================================
// Example 8: Error Handling
// ============================================================================

export async function createLinkWithErrorHandling(url: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  try {
    const dub = await getDubClient(session.user.id);

    const link = await dub.links.create({
      url,
      domain: "dub.sh",
    });

    return { success: true, link };
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific integration errors
      if (error.message.includes("not connected")) {
        return {
          success: false,
          error: "Please connect your Dub.sh account",
          code: "NOT_CONNECTED",
        };
      }

      if (
        error.message.includes("disconnected") ||
        error.message.includes("error")
      ) {
        return {
          success: false,
          error: "Your Dub.sh integration needs to be reconnected",
          code: "RECONNECT_REQUIRED",
        };
      }
    }

    // Generic error
    return {
      success: false,
      error: "Failed to create short link",
      code: "UNKNOWN_ERROR",
    };
  }
}

// ============================================================================
// Example 9: React Hook for Client Component
// ============================================================================

("use client");

import { useState } from "react";

export function useCreateShortLink() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async (url: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await createShortLinkAction(url);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create link";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { createLink, loading, error };
}

// Usage in component:
// const { createLink, loading, error } = useCreateShortLink();
// const link = await createLink("https://example.com");

// ============================================================================
// Example 10: Helper Function - Get or Create Integration
// ============================================================================

import { getDubWorkspaces } from "@/lib/integrations/providers/dub/utils";

export async function ensureDubIntegration(userId: string) {
  const integration = await getIntegration(userId, "dub");

  if (!integration) {
    throw new Error(
      "Dub integration not found. Please connect Dub.sh in your settings."
    );
  }

  if (integration.status !== "active") {
    throw new Error(
      `Dub integration is ${integration.status}. Please reconnect in settings.`
    );
  }

  // Fetch workspace info to verify connection
  const workspaces = await getDubWorkspaces(userId);

  return {
    integration,
    workspaces,
  };
}

// ============================================================================
// Key Takeaways
// ============================================================================

/**
 * 1. Always use getDubClient() - it handles token refresh automatically
 *
 * 2. Check integration status before using:
 *    - hasIntegration() for quick check
 *    - getIntegration() for detailed info
 *
 * 3. Handle errors gracefully:
 *    - "not connected" → redirect to settings
 *    - "disconnected" or "error" → prompt to reconnect
 *
 * 4. Token refresh is automatic:
 *    - Happens transparently when token expires
 *    - No manual intervention needed
 *    - Uses mutex to prevent concurrent refreshes
 *
 * 5. All functions are type-safe:
 *    - Full TypeScript support
 *    - IDE autocomplete
 *    - Compile-time checks
 *
 * 6. Integrations are user-specific:
 *    - Always pass userId
 *    - Each user has their own tokens
 *    - Isolated from other users
 */


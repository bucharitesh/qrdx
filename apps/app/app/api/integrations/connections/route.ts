import { database as db, integration } from "@repo/database";
import {
  FILE_PICKER_PROVIDERS,
  getIntegrationRegistry,
  SHORT_LINK_PROVIDERS,
} from "@repo/integrations";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/connected-accounts/server";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible, setupNeeded } from "@/lib/integration-availability-rules";
import { isIntegrationConfigured } from "@/lib/integration-oauth";

const PROVIDERS = [...SHORT_LINK_PROVIDERS, ...FILE_PICKER_PROVIDERS];

/**
 * GET /api/integrations/connections — which short-link and file-picker
 * accounts the signed-in user has connected (no tokens, no metadata).
 * Production and preview leave out providers that need setup; local dev
 * lists them with `needsSetup` (env variable names, never values).
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ provider: integration.provider, status: integration.status })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        inArray(integration.provider, PROVIDERS),
      ),
    );
  const status = new Map(rows.map((row) => [row.provider, row.status]));
  const registry = getIntegrationRegistry();
  const availability = getIntegrationAvailability();

  return NextResponse.json({
    providers: PROVIDERS.flatMap((slug) => {
      const definition = registry.get(slug);
      if (!(definition && isVisible(availability, slug))) return [];
      const needsSetup = setupNeeded(availability, slug);
      return [
        {
          slug,
          name: definition.name,
          logo: definition.logos.light,
          capability: (SHORT_LINK_PROVIDERS as readonly string[]).includes(slug)
            ? "short-links"
            : "files",
          configured: isIntegrationConfigured(slug),
          connected: status.has(slug),
          status: status.get(slug) ?? null,
          ...(needsSetup && { needsSetup }),
        },
      ];
    }),
  });
}

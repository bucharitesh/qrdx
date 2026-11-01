import "server-only";

import { database as db, integration } from "@repo/database";
import {
  getIntegrationRegistry,
  INTEGRATION_ENV_VARS,
  initializeIntegrations,
} from "@repo/integrations";
import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
import { and, eq, inArray } from "drizzle-orm";
import { env } from "@/lib/env";
import {
  computeAvailability,
  type IntegrationAvailability,
  isVisible,
} from "@/lib/integration-availability-rules";

initializeIntegrations();

/**
 * Which integrations this deployment can offer, from its environment (names
 * only; values never leave the server). In production and preview builds,
 * unavailable ones are hidden everywhere; in local dev they are shown with a
 * "Needs setup" badge. Pass the result to client components as a prop.
 */
export function getIntegrationAvailability(): IntegrationAvailability {
  const registry = getIntegrationRegistry();
  const slugs = [
    ...getIntegrationCatalog().map((entry) => entry.slug),
    ...registry.getAll().map((definition) => definition.slug),
  ];
  return computeAvailability(slugs, {
    env: env as Readonly<Record<string, string | undefined>>,
    production: process.env.NODE_ENV === "production",
    definition: (slug) => registry.get(slug),
    credentials: (slug) => INTEGRATION_ENV_VARS[slug],
  });
}

/** True when `slug` may be shown here (available, or local dev). */
export function isIntegrationVisible(slug: string): boolean {
  return isVisible(getIntegrationAvailability(), slug);
}

/** A stored connection as settings need it: no tokens, nothing decrypted. */
export interface StoredConnection {
  provider: string;
  status: "active" | "disconnected" | "error";
  createdAt: Date;
}

/**
 * The user's stored connections among `slugs`, by provider. Reads only the
 * provider, status and date, so it works for integrations QRdx can no longer
 * use (missing app keys, or the encryption key in production).
 */
export async function getStoredConnections(
  userId: string,
  slugs: readonly string[],
): Promise<Map<string, StoredConnection>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({
      provider: integration.provider,
      status: integration.status,
      createdAt: integration.createdAt,
    })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        inArray(integration.provider, [...slugs]),
      ),
    );
  return new Map(
    rows.map((row) => [
      row.provider,
      { ...row, status: row.status as StoredConnection["status"] },
    ]),
  );
}

/**
 * Dev only (`next dev`): /settings/integrations/<slug>?integrations-mock=unavailable
 * shows the page as production does for a hidden integration the user
 * connected before it was hidden, with a sample connection. Nothing is read,
 * stored or deleted (Disconnect is a no-op there; see integration-detail.tsx).
 */
export function isUnavailableMock(
  value: string | string[] | undefined,
): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return (Array.isArray(value) ? value[0] : value) === "unavailable";
}

export const SAMPLE_STORED_CONNECTION: Omit<StoredConnection, "provider"> = {
  status: "active",
  createdAt: new Date("2026-03-14T10:00:00Z"),
};

import "server-only";

import {
  getIntegrationRegistry,
  INTEGRATION_ENV_VARS,
  initializeIntegrations,
} from "@repo/integrations";
import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
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

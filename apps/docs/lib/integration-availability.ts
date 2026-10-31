import "server-only";

import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { isIntegrationConfigured } from "@/lib/integration-oauth";

initializeIntegrations();

/**
 * Catalog entries backed by a registry integration that needs credentials
 * (OAuth app or encryption key) this server doesn't have. Shown as "Not
 * configured" in the public directory instead of a connect flow that fails.
 */
export function getUnconfiguredIntegrationSlugs(): string[] {
  return getIntegrationRegistry()
    .getAll()
    .filter(
      (definition) =>
        (definition.type === "oauth" || definition.type === "api_key") &&
        !isIntegrationConfigured(definition.slug),
    )
    .map((definition) => definition.slug);
}

export function isIntegrationUnconfigured(slug: string): boolean {
  return getUnconfiguredIntegrationSlugs().includes(slug);
}

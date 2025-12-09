import type { IntegrationCategory } from "../types";
import type { IntegrationConfig, IntegrationDefinition } from "./types";

/**
 * Integration Registry - manages all available integrations
 */
export class IntegrationRegistry {
  private readonly integrations = new Map<string, IntegrationDefinition>();
  private readonly configs = new Map<string, IntegrationConfig>();

  /**
   * Register an integration definition
   */
  register(integration: IntegrationDefinition): void {
    this.integrations.set(integration.slug, integration);
  }

  /**
   * Register an integration with full configuration (including credentials)
   */
  registerWithConfig(config: IntegrationConfig): void {
    // Register the definition
    this.register(config);
    // Store the full config separately
    this.configs.set(config.slug, config);
  }

  /**
   * Get an integration by slug
   */
  get(slug: string): IntegrationDefinition | undefined {
    return this.integrations.get(slug);
  }

  /**
   * Get full configuration for an integration (includes credentials)
   */
  getConfig(slug: string): IntegrationConfig | undefined {
    return this.configs.get(slug);
  }

  /**
   * Get all registered integrations
   */
  getAll(): IntegrationDefinition[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get integrations by category
   */
  getByCategory(category: IntegrationCategory): IntegrationDefinition[] {
    return this.getAll().filter((integration) =>
      integration.category.includes(category)
    );
  }

  /**
   * Get integrations by type
   */
  getByType(type: "oauth" | "api_key" | "webhook"): IntegrationDefinition[] {
    return this.getAll().filter((integration) => integration.type === type);
  }

  /**
   * Check if an integration exists
   */
  has(slug: string): boolean {
    return this.integrations.has(slug);
  }

  /**
   * Get all integration slugs
   */
  getSlugs(): string[] {
    return Array.from(this.integrations.keys());
  }

  /**
   * Search integrations by name or description
   */
  search(query: string): IntegrationDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      (integration) =>
        integration.name.toLowerCase().includes(lowerQuery) ||
        integration.description.toLowerCase().includes(lowerQuery) ||
        integration.features.some((feature) =>
          feature.toLowerCase().includes(lowerQuery)
        )
    );
  }
}

// Global registry instance
let globalRegistry: IntegrationRegistry | null = null;

/**
 * Get the global integration registry
 */
export function getIntegrationRegistry(): IntegrationRegistry {
  if (!globalRegistry) {
    globalRegistry = new IntegrationRegistry();
  }
  return globalRegistry;
}

/**
 * Initialize the global registry (optional, for testing or manual setup)
 */
export function initializeRegistry(
  integrations: IntegrationDefinition[]
): void {
  const registry = getIntegrationRegistry();
  for (const integration of integrations) {
    registry.register(integration);
  }
}

/**
 * Reset the global registry (for testing)
 */
export function resetRegistry(): void {
  globalRegistry = null;
}

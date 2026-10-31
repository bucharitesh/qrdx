import type {
  IntegrationCapability,
  IntegrationLogoSet,
} from "@repo/integration-kit";
import type {
  IntegrationCategory,
  IntegrationType,
  OAuthConfig,
} from "../types";

/**
 * Integration definition - metadata about an available integration
 */
export interface IntegrationDefinition {
  slug: string;
  name: string;
  description: string;
  logos: IntegrationLogoSet;
  category: IntegrationCategory[];
  type: IntegrationType;
  oauth?: OAuthConfig;
  capabilities: IntegrationCapability[];
  features: string[];
  configurable: boolean;
  developedBy?: string;
  website?: string;
  /** Connect by pasting an API key or personal token (alone or next to OAuth). */
  apiKey?: IntegrationApiKeyConfig;
}

/**
 * How a user connects with an API key or personal token.
 */
export interface IntegrationApiKeyConfig {
  /** Field label, e.g. "API key" or "Generic access token". */
  label: string;
  placeholder?: string;
  /** Where in the provider's app the user creates the key. */
  helpUrl: string;
  /** One sentence on where to find it. */
  helpText: string;
}

/**
 * Integration configuration with credentials
 */
export interface IntegrationConfig extends IntegrationDefinition {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  supportsRefresh: boolean;
}

import type {
  IntegrationCategory,
  IntegrationType,
  OAuthConfig,
} from "../types";

/**
 * Integration definition - metadata about an available integration
 */
export type IntegrationDefinition = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  category: IntegrationCategory[];
  type: IntegrationType;
  oauth?: OAuthConfig;
  features: string[];
  configurable: boolean;
  developedBy?: string;
  website?: string;
};

/**
 * Integration configuration with credentials
 */
export interface IntegrationConfig extends IntegrationDefinition {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  supportsRefresh: boolean;
}

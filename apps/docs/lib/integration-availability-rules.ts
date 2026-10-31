// Which integrations QRdx can offer, decided from what is configured on
// QRdx's side. Pure: the environment, the registry and the credential names
// come in as arguments, so this is testable without real values and safe to
// share. lib/integration-availability.ts feeds it the server environment.
//
// The rule mirrors isIntegrationConfigured (lib/integration-oauth.ts):
// - No registry definition (guides like Zapier, native features like the
//   analytics pixels, Discord webhooks), type "none" (YouTube, Spotify link
//   parsing) or "webhook": nothing to configure, always available.
// - OAuth: the app's client id and secret (and redirect URI where one is
//   configured separately). An OAuth integration with an API-key fallback
//   (Bitly) needs no app credentials.
// - Anything that stores a token or API key (OAuth and "api_key", like
//   Rebrandly, Short.io, Stripe, Cal.com and Shopify) also needs
//   INTEGRATION_ENCRYPTION_KEY in production, where tokens must be encrypted.

/** Encrypts stored tokens and API keys; required in production. */
export const ENCRYPTION_KEY_VAR = "INTEGRATION_ENCRYPTION_KEY";

/** The registry fields the rule reads. */
export interface AvailabilityDefinition {
  type: "oauth" | "api_key" | "webhook" | "none";
  /** OAuth integrations with this also connect with a pasted key or token. */
  apiKey?: unknown;
}

export interface AvailabilityCredentialNames {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export interface AvailabilityContext {
  /** Environment variables by name. Only whether each is set is read. */
  env: Readonly<Record<string, string | undefined>>;
  /**
   * Production and preview builds (NODE_ENV === "production"): stored
   * tokens must be encrypted, and unavailable integrations are hidden.
   */
  production: boolean;
  /** The registry definition for a slug; undefined when it has none. */
  definition: (slug: string) => AvailabilityDefinition | undefined;
  /** The OAuth credential variable names for a slug. */
  credentials: (slug: string) => AvailabilityCredentialNames | undefined;
}

/**
 * Names of the environment variables QRdx still needs before `slug` can be
 * connected, in a stable order. Empty when it is available. Names only:
 * values are never read beyond "is it set".
 */
export function missingSetup(slug: string, ctx: AvailabilityContext): string[] {
  const definition = ctx.definition(slug);
  if (
    !definition ||
    definition.type === "none" ||
    definition.type === "webhook"
  )
    return [];

  const isSet = (name: string) => Boolean(ctx.env[name]?.trim());
  const missing: string[] = [];

  if (definition.type === "oauth" && !definition.apiKey) {
    const names = ctx.credentials(slug);
    const prefix = slug.toUpperCase().replaceAll("-", "_");
    const required = names
      ? [names.clientId, names.clientSecret, names.redirectUri]
      : [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`];
    for (const name of required) {
      if (name && !isSet(name)) missing.push(name);
    }
  }

  if (ctx.production && !isSet(ENCRYPTION_KEY_VAR)) {
    missing.push(ENCRYPTION_KEY_VAR);
  }
  return missing;
}

/** What the server tells pages and client components. Names, never values. */
export interface IntegrationAvailability {
  /**
   * Local dev: list integrations that need setup too, with a "Needs setup"
   * badge. Production and preview: hide them everywhere.
   */
  showUnavailable: boolean;
  /** Unavailable slugs → the variable names they still need. */
  needsSetup: Record<string, string[]>;
}

export function computeAvailability(
  slugs: Iterable<string>,
  ctx: AvailabilityContext,
): IntegrationAvailability {
  const needsSetup: Record<string, string[]> = {};
  for (const slug of new Set(slugs)) {
    const missing = missingSetup(slug, ctx);
    if (missing.length > 0) needsSetup[slug] = missing;
  }
  return { showUnavailable: !ctx.production, needsSetup };
}

/** Everything QRdx needs for it is configured. */
export function isAvailable(
  availability: IntegrationAvailability,
  slug: string,
): boolean {
  return !Object.hasOwn(availability.needsSetup, slug);
}

/** Shown to visitors and users: available, or local dev. */
export function isVisible(
  availability: IntegrationAvailability,
  slug: string,
): boolean {
  return availability.showUnavailable || isAvailable(availability, slug);
}

/** The missing variable names for a shown-but-unavailable slug (dev only). */
export function setupNeeded(
  availability: IntegrationAvailability,
  slug: string,
): string[] | undefined {
  return isAvailable(availability, slug)
    ? undefined
    : availability.needsSetup[slug];
}

/** Keeps the items whose slug is visible. */
export function filterVisible<T>(
  availability: IntegrationAvailability,
  items: readonly T[],
  slugOf: (item: T) => string,
): T[] {
  return items.filter((item) => isVisible(availability, slugOf(item)));
}

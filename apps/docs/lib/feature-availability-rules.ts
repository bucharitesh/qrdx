// Which built-in features this deployment can offer, decided from what is
// configured on QRdx's side (an API key, a bucket, a Vercel token). Pure: the
// environment comes in as an argument and only "is it set" is read, so this
// is testable without real values and safe to import from client code.
// lib/feature-availability.ts feeds it the server environment.
//
// A feature that can't work here is left out everywhere it would be offered:
// nav, footer and dashboard links, pricing rows and plan-card lines, the
// sitemap and llms.txt. It comes back on its own once its variables are set
// (prerendered pages pick the change up on the next deploy). Integrations
// are decided in lib/integration-availability-rules.ts, which defers to these
// rules for the catalog entries that are really built-in features.

export const FEATURE_IDS = [
  "aiThemes",
  "aiArt",
  "customDomains",
  "fileStorage",
  "email",
  "spamCheck",
  "linkSafety",
  "scheduledJobs",
  "youtubeChannelPicker",
  "spotifyPlaylistPicker",
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export interface FeatureContext {
  /** Environment variables by name. Only whether each is set is read. */
  env: Readonly<Record<string, string | undefined>>;
  /**
   * Hosted on Vercel (VERCEL is set). Vercel routes only domains added to
   * the project, so custom domains need the Domains API there; anywhere else
   * the owner routes the domain and proves it with a DNS TXT record.
   */
  onVercel: boolean;
  /** Production and preview builds (NODE_ENV === "production"). */
  production: boolean;
}

interface FeatureRule {
  name: string;
  /** Variable names that must be set; empty when nothing needs configuring. */
  requires: (ctx: FeatureContext) => readonly string[];
  /**
   * Pages that only offer this feature. They leave the nav, footer, app
   * sidebar, sitemap and llms.txt while it's unavailable; the pages
   * themselves keep working (existing users may still need them).
   */
  paths?: readonly string[];
  /**
   * Catalog entries (@repo/integrations) that can't work without it: hidden
   * from /integrations, settings shortcuts, the sitemap and llms.txt.
   */
  catalogSlugs?: readonly string[];
  /** The catalog entry whose `configuredExtras` paragraphs describe it. */
  extrasOf?: string;
}

export const FEATURE_RULES: Record<FeatureId, FeatureRule> = {
  // All AI runs through Vercel AI Gateway (lib/ai/providers.ts); the models
  // per task are in lib/ai/models.ts.
  aiThemes: {
    name: "AI themes (Vercel AI Gateway)",
    requires: () => ["AI_GATEWAY_API_KEY"],
    paths: ["/ai"],
  },
  aiArt: {
    name: "AI QR art (Vercel AI Gateway)",
    requires: () => ["AI_GATEWAY_API_KEY"],
    paths: ["/ai/art"],
  },
  customDomains: {
    // Serving domains already verified never depends on this: proxy.ts reads
    // them from the database. Only adding and verifying new ones does.
    name: "Custom domains",
    requires: (ctx) =>
      ctx.onVercel ? ["VERCEL_API_TOKEN", "VERCEL_PROJECT_ID"] : [],
    paths: [
      "/dashboard/domains",
      "/docs/custom-domains",
      "/docs/help/domains/custom-domains",
    ],
    // Tag Manager containers run any script, so they only ever load on a
    // customer's own domain (components/landing/pixels.tsx).
    catalogSlugs: ["custom-domains", "google-tag-manager"],
  },
  fileStorage: {
    name: "File storage (Cloudflare R2)",
    requires: () => [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
    ],
  },
  email: {
    name: "Email (Resend)",
    requires: () => ["RESEND_API_KEY", "EMAIL_FROM"],
    catalogSlugs: ["email-alerts"],
  },
  spamCheck: {
    name: "Form spam check (Turnstile)",
    requires: () => ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
  },
  linkSafety: {
    name: "Safe Browsing (Web Risk)",
    requires: () => ["WEB_RISK_API_KEY"],
  },
  scheduledJobs: {
    // Vercel Cron authenticates with it; the jobs refuse to run without it
    // in production (webhook retries, weekly digests).
    name: "Scheduled jobs (cron)",
    requires: (ctx) => (ctx.production ? ["CRON_SECRET"] : []),
  },
  youtubeChannelPicker: {
    // Pasting YouTube links needs nothing; picking from a channel does.
    name: "YouTube channel picker",
    requires: () => ["YOUTUBE_API_KEY"],
    extrasOf: "youtube",
  },
  spotifyPlaylistPicker: {
    name: "Spotify playlist picker",
    requires: () => ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    extrasOf: "spotify",
  },
};

/**
 * The variable names `id` still needs here, in a stable order. Empty when it
 * is available.
 */
export function missingFeatureSetup(
  id: FeatureId,
  ctx: FeatureContext,
): string[] {
  return FEATURE_RULES[id]
    .requires(ctx)
    .filter((name) => !ctx.env[name]?.trim());
}

export type FeatureMap = Record<FeatureId, boolean>;

export function computeFeatures(ctx: FeatureContext): FeatureMap {
  return Object.fromEntries(
    FEATURE_IDS.map((id) => [id, missingFeatureSetup(id, ctx).length === 0]),
  ) as FeatureMap;
}

/** The feature a catalog entry needs (custom-domains, email-alerts, …). */
export function featureForCatalogSlug(slug: string): FeatureId | undefined {
  return FEATURE_IDS.find((id) =>
    FEATURE_RULES[id].catalogSlugs?.includes(slug),
  );
}

/**
 * A catalog entry's "What it does" paragraphs: `configuredExtras` only where
 * the feature they describe works (the YouTube and Spotify pickers).
 */
export function catalogParagraphs(
  entry: { slug: string; description: string[]; configuredExtras?: string[] },
  features: Readonly<Record<FeatureId, boolean>>,
): string[] {
  const id = FEATURE_IDS.find(
    (key) => FEATURE_RULES[key].extrasOf === entry.slug,
  );
  const extras = id && features[id] ? (entry.configuredExtras ?? []) : [];
  return [...entry.description, ...extras];
}

/**
 * How custom domains are connected here (see lib/custom-domains.ts):
 * "vercel" through the Domains API, "manual" with a DNS TXT record when
 * self-hosted, "disabled" on Vercel without API access.
 */
export type CustomDomainMode = "vercel" | "manual" | "disabled";

export function customDomainMode(ctx: FeatureContext): CustomDomainMode {
  const isSet = (name: string) => Boolean(ctx.env[name]?.trim());
  if (isSet("VERCEL_API_TOKEN") && isSet("VERCEL_PROJECT_ID")) return "vercel";
  return ctx.onVercel ? "disabled" : "manual";
}

/** What the server tells client components: ids and paths, never names. */
export interface PublicAvailability {
  /** Features that can't work here. */
  unavailable: FeatureId[];
  /** Pages that only lead to an unavailable feature. */
  hiddenPaths: string[];
  /** Integration slugs hidden here (production and preview only). */
  hiddenIntegrations: string[];
}

/** Everything is offered: the default without a server-provided value. */
export const ALL_AVAILABLE: PublicAvailability = {
  unavailable: [],
  hiddenPaths: [],
  hiddenIntegrations: [],
};

export function toPublicAvailability(
  features: FeatureMap,
  hiddenIntegrations: readonly string[] = [],
): PublicAvailability {
  const unavailable = FEATURE_IDS.filter((id) => !features[id]);
  return {
    unavailable,
    hiddenPaths: unavailable.flatMap((id) => FEATURE_RULES[id].paths ?? []),
    hiddenIntegrations: [...hiddenIntegrations].sort(),
  };
}

const pathOf = (href: string) => href.split(/[?#]/, 1)[0] ?? href;

/**
 * False for a link to a page that only offers an unavailable feature
 * (exact path; query and hash ignored). External links always pass.
 */
export function isPathShown(
  hiddenPaths: readonly string[],
  href: string,
): boolean {
  return !hiddenPaths.includes(pathOf(href));
}

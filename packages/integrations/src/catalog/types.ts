// Public integration catalog: everything QRdx connects to, including the
// OAuth integrations in the registry ("connect"), features built into QRdx
// ("native") and setups that work through another tool ("guide").
// Client-safe: no database, crypto or server-only imports.

/** How an integration is set up. */
export type CatalogKind = "native" | "connect" | "guide";

export type CatalogCategory =
  | "links"
  | "storage"
  | "notifications"
  | "analytics"
  | "automation"
  | "ai"
  | "plugins"
  | "developers"
  | "sources"
  | "crm";

/** Lowest plan the integration needs. */
export type CatalogPlan = "no-account" | "free" | "pro" | "business";

/** iconsax brand icons used as logos (drawn in `color` on a white tile). */
export type CatalogBrandIcon = "Slack" | "Figma" | "Chrome";

/** iconsax icons used for QRdx's own features (neutral tile). */
export type CatalogFeatureIcon =
  | "Code1"
  | "CommandSquare"
  | "Flash"
  | "Gallery"
  | "Global"
  | "Sms";

export type CatalogLogo =
  /** Third-party logo file in apps/docs/public, shown on a white tile. */
  | { type: "image"; src: string }
  | { type: "brand"; icon: CatalogBrandIcon; color: string }
  | { type: "feature"; icon: CatalogFeatureIcon };

export type CatalogSnippetLanguage =
  | "bash"
  | "html"
  | "json"
  | "text"
  | "toml"
  | "ts"
  | "tsx";

export interface CatalogSnippet {
  /** File name or short caption shown above the code. */
  label?: string;
  language: CatalogSnippetLanguage;
  code: string;
}

export interface CatalogStep {
  title: string;
  body?: string;
  snippet?: CatalogSnippet;
}

export interface CatalogCapability {
  title: string;
  description: string;
}

/** MCP clients with a one-click install link built from the server URL. */
export type McpInstallClient = "cursor" | "vscode";

/**
 * A button on the detail page. Every `https://qrdx.dev` in `href`/`text` is
 * swapped for the deployment's own origin when rendered.
 */
export type CatalogAction =
  | { type: "link"; label: string; href: string }
  | { type: "copy"; label: string; text: string; toast?: string }
  /** Copy `text`, then open `href` in a new tab (connector screens). */
  | {
      type: "copy-open";
      label: string;
      text: string;
      href: string;
      toast: string;
    }
  | { type: "mcp-install"; label: string; client: McpInstallClient };

export interface IntegrationCatalogEntry {
  slug: string;
  name: string;
  /** One line for cards and meta descriptions. */
  tagline: string;
  /** "What it does" paragraphs. */
  description: string[];
  kind: CatalogKind;
  categories: CatalogCategory[];
  logo: CatalogLogo;
  plan: CatalogPlan;
  builtBy: string;
  website?: string;
  docs?: string;
  primaryAction: CatalogAction;
  secondaryAction?: CatalogAction;
  steps: CatalogStep[];
  capabilities: CatalogCapability[];
  /** Short caveat shown under the header, e.g. "Install from source". */
  note?: string;
  /** Extra words the search box should match. */
  keywords?: string[];
  /** Explicit related slugs; the rest is filled from the same category. */
  related?: string[];
}

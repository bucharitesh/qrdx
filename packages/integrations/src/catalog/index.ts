import { ai } from "./entries/ai";
import { analytics } from "./entries/analytics";
import { automation } from "./entries/automation";
import { crm } from "./entries/crm";
import { developers } from "./entries/developers";
import { filePickers } from "./entries/file-pickers";
import { linksAndStorage } from "./entries/links-storage";
import { notifications } from "./entries/notifications";
import { plugins } from "./entries/plugins";
import { shortLinks } from "./entries/short-links";
import { sources } from "./entries/sources";
import type {
  CatalogCategory,
  CatalogKind,
  CatalogPlan,
  CatalogSurface,
  IntegrationCatalogEntry,
} from "./types";

export {
  CHATGPT_CONNECTORS_URL,
  CLAUDE_CONNECTORS_URL,
  MCP_PROMPTS,
  MCP_SERVER_URL,
  MCP_SNIPPETS,
} from "./entries/ai";
export type * from "./types";

export const CATALOG_CATEGORIES: {
  id: CatalogCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "notifications",
    label: "Notifications",
    description: "Scan milestones and form responses where your team works.",
  },
  {
    id: "automation",
    label: "Automation",
    description: "Send every QRdx event to your own tools and workflows.",
  },
  {
    id: "crm",
    label: "CRM and email",
    description: "Form responses straight into your contacts and audiences.",
  },
  {
    id: "ai",
    label: "AI assistants",
    description: "Generate QR codes from chat and coding agents over MCP.",
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Your own pixels on the hosted pages your codes open.",
  },
  {
    id: "links",
    label: "Links",
    description: "Short links and branded domains for dynamic codes.",
  },
  {
    id: "sources",
    label: "Content sources",
    description: "QR codes from what's already in your accounts.",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Turn files you already store into QR codes.",
  },
  {
    id: "plugins",
    label: "Plugins",
    description: "QRdx inside your browser, design tools and launcher.",
  },
  {
    id: "developers",
    label: "Developers",
    description: "APIs, CLI and components to build QR codes into anything.",
  },
];

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  native: "Built in",
  connect: "Connect",
  guide: "Guide",
};

export const CATALOG_KIND_DESCRIPTIONS: Record<CatalogKind, string> = {
  native: "Part of QRdx. Set it up in your dashboard or settings.",
  connect: "Connect your account with a secure sign-in or your own API key.",
  guide: "Works through the other tool, with step-by-step setup.",
};

export const CATALOG_PLAN_LABELS: Record<CatalogPlan, string> = {
  "no-account": "Free, no account",
  free: "Free",
  pro: "Pro",
  business: "Business",
};

const ENTRIES: IntegrationCatalogEntry[] = [
  ...notifications,
  ...automation,
  ...crm,
  ...ai,
  ...analytics,
  ...linksAndStorage,
  ...shortLinks,
  ...filePickers,
  ...sources,
  ...plugins,
  ...developers,
];

const BY_SLUG = new Map(ENTRIES.map((entry) => [entry.slug, entry]));

/**
 * Every catalog entry, in display order, whatever its surface. Use
 * `getCatalogBySurface("integrations")` for what /integrations lists.
 */
export function getIntegrationCatalog(): IntegrationCatalogEntry[] {
  return ENTRIES;
}

/** The entries presented on one surface, in display order. */
export function getCatalogBySurface(
  surface: CatalogSurface
): IntegrationCatalogEntry[] {
  return ENTRIES.filter((entry) => entry.surface === surface);
}

/** True for third-party connections: listed on /integrations with a page. */
export function isListedIntegration(entry: IntegrationCatalogEntry): boolean {
  return entry.surface === "integrations";
}

/**
 * Where /integrations/<slug> sends visitors for an entry that lives on
 * another surface (its `canonicalPath`); undefined for listed integrations.
 */
export function getCatalogRedirect(
  entry: IntegrationCatalogEntry
): string | undefined {
  return isListedIntegration(entry) ? undefined : entry.canonicalPath;
}

export function getCatalogEntry(
  slug: string
): IntegrationCatalogEntry | undefined {
  return BY_SLUG.get(slug);
}

export function getCategoryLabel(category: CatalogCategory): string {
  return CATALOG_CATEGORIES.find((item) => item.id === category)?.label ?? "";
}

/** The categories (in display order) that at least one of `entries` is in. */
export function getUsedCategories(
  entries: IntegrationCatalogEntry[]
): typeof CATALOG_CATEGORIES {
  return CATALOG_CATEGORIES.filter((category) =>
    entries.some((entry) => entry.categories.includes(category.id))
  );
}

/**
 * Explicit `related` first, then entries sharing the first category. Only
 * entries on the same surface, so an integration links to integrations.
 */
export function getRelatedEntries(
  entry: IntegrationCatalogEntry,
  limit = 3
): IntegrationCatalogEntry[] {
  const picked = new Map<string, IntegrationCatalogEntry>();
  const eligible = (candidate: IntegrationCatalogEntry) =>
    candidate.slug !== entry.slug && candidate.surface === entry.surface;
  for (const slug of entry.related ?? []) {
    const related = BY_SLUG.get(slug);
    if (related && eligible(related)) picked.set(slug, related);
  }
  for (const candidate of ENTRIES) {
    if (picked.size >= limit) break;
    if (eligible(candidate) && candidate.categories[0] === entry.categories[0]) {
      picked.set(candidate.slug, candidate);
    }
  }
  return [...picked.values()].slice(0, limit);
}

export function matchesCatalogQuery(
  entry: IntegrationCatalogEntry,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    entry.name,
    entry.tagline,
    ...entry.categories.map(getCategoryLabel),
    ...(entry.keywords ?? []),
  ].some((text) => text.toLowerCase().includes(q));
}

const DEFAULT_ORIGIN = "https://qrdx.dev";

/** Points catalog URLs and snippets at the deployment that renders them. */
export function withOrigin(text: string, origin: string): string {
  const clean = origin.replace(/\/+$/, "");
  return clean === DEFAULT_ORIGIN
    ? text
    : text.replaceAll(DEFAULT_ORIGIN, clean);
}

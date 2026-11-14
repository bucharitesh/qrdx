import "server-only";

import { CANONICAL_ORIGIN } from "@repo/config";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import type { PricingOptions } from "@/components/sections/pricing/plan-content";
import {
  blogSource,
  compareSource,
  customersSource,
  legalSource,
} from "@/lib/content-source";
import { docsZoneManifest } from "@/lib/docs-zone-manifest";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import { configuredEntry } from "@/lib/feature-availability-rules";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { filterVisible } from "@/lib/integration-availability-rules";
import { baseUrl } from "@/lib/metadata";
import { getPublishedVersion } from "@/lib/npm-version";
import { PLAN_LIMITS } from "@/lib/plans";
import cliPackage from "../../../../packages/cli/package.json";
import qrdxPackage from "../../../../packages/qrdx/package.json";
import { buildLlmsTxt, type LlmsDocsSection, type LlmsLink } from "./llms-txt";

/** What this deployment offers, as the pricing page reads it. */
export function pricingOptions(): PricingOptions {
  return {
    aiArt: isFeatureAvailable("aiArt"),
    aiThemes: isFeatureAvailable("aiThemes"),
    customDomains: isFeatureAvailable("customDomains"),
    fileStorage: isFeatureAvailable("fileStorage"),
    emailAlerts: isFeatureAvailable("email"),
    sso: isFeatureAvailable("sso"),
    auditLog: isFeatureAvailable("auditLog"),
    invoiceRequests: isFeatureAvailable("invoiceRequests"),
  };
}

const pageLink = (page: {
  url: string;
  data: { title: string; description?: string };
}): LlmsLink => ({
  title: page.data.title,
  url: page.url,
  description: page.data.description || undefined,
});

/** Legal pages in their sidebar order (content/legal/meta.json). */
function legalPages() {
  const order = legalSource.pageTree.children.flatMap((node) =>
    node.type === "page" ? [node.url] : [],
  );
  const rank = (url: string) =>
    order.includes(url) ? order.indexOf(url) : order.length;
  return legalSource.getPages().sort((a, b) => rank(a.url) - rank(b.url));
}

/**
 * Without a docs site (DOCS_ZONE_URL unset) the docs URLs redirect to
 * qrdx.dev (next.config.ts), so llms.txt links the docs there, from their
 * home page.
 */
const DOCS_ON_QRDX: LlmsDocsSection[] = [
  {
    title: "",
    pages: [
      {
        title: "QRdx docs",
        url: "/docs",
        description:
          "Help articles, guides and the developer docs (REST API, MCP server, CLI, React library), on qrdx.dev",
      },
    ],
  },
];

/** The /llms.txt body for this deployment. */
export async function llmsTxt(): Promise<string> {
  const [libraryVersion, cliVersion, docsZone] = await Promise.all([
    getPublishedVersion("qrdx"),
    getPublishedVersion("@qrdx/cli"),
    // The docs site's sections when DOCS_ZONE_URL is set (it serves the
    // docs then); null without it.
    docsZoneManifest(),
  ]);

  // Third-party integrations this deployment offers; AI assistants,
  // developer tools and plugins have pages of their own.
  const integrations = filterVisible(
    getIntegrationAvailability(),
    getCatalogBySurface("integrations"),
    (entry) => entry.slug,
  ).map((entry) => ({
    title: entry.name,
    url: `/integrations/${entry.slug}`,
    description: configuredEntry(entry, isFeatureAvailable).tagline,
  }));
  const plugins = getCatalogBySurface("plugins").map((entry) => ({
    title: entry.name,
    url: entry.canonicalPath ?? "/plugins",
    description: `${entry.tagline}${entry.note ? ` ${entry.note}` : ""}`,
  }));

  const newestFirst = (a: { data: { date: string } }, b: typeof a) =>
    new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
  const blog = blogSource
    .getPages()
    .filter((page) => page.data.published)
    .sort(newestFirst)
    .map(pageLink);
  // Published customers' stories only (lib/content-source.ts).
  const customers = customersSource.getPages().sort(newestFirst).map(pageLink);

  return buildLlmsTxt({
    origin: baseUrl,
    docsOrigin: docsZone ? baseUrl : new URL(CANONICAL_ORIGIN),
    offered: pricingOptions(),
    showsPath: isPathAvailable,
    limits: PLAN_LIMITS,
    docs: docsZone?.sections ?? DOCS_ON_QRDX,
    blog,
    customers,
    compare: compareSource.getPages().map(pageLink),
    legal: legalPages().map(pageLink),
    integrations,
    plugins,
    npm: {
      library: {
        name: "qrdx",
        repo: qrdxPackage.version,
        published: libraryVersion,
      },
      cli: {
        name: "@qrdx/cli",
        repo: cliPackage.version,
        published: cliVersion,
      },
    },
  });
}

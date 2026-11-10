import "server-only";

import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import type { PricingOptions } from "@/components/sections/pricing/plan-content";
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
import { blogSource, compareSource, legalSource } from "@/lib/source";
import cliPackage from "../../../../packages/cli/package.json";
import qrdxPackage from "../../../../packages/qrdx/package.json";
import { docsSections } from "./docs-pages";
import { buildLlmsTxt, type LlmsLink } from "./llms-txt";

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

/** The /llms.txt body for this deployment. */
export async function llmsTxt(): Promise<string> {
  const [libraryVersion, cliVersion] = await Promise.all([
    getPublishedVersion("qrdx"),
    getPublishedVersion("@qrdx/cli"),
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

  const blog = blogSource
    .getPages()
    .filter((page) => page.data.published)
    .sort(
      (a, b) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
    )
    .map(pageLink);

  return buildLlmsTxt({
    origin: baseUrl,
    offered: pricingOptions(),
    showsPath: isPathAvailable,
    limits: PLAN_LIMITS,
    docs: docsSections().map((section) => ({
      title: section.title,
      pages: section.pages.map(pageLink),
    })),
    blog,
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

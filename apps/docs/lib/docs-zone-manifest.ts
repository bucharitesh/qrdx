import "server-only";

import {
  DOCS_MANIFEST_PATH,
  type DocsManifest,
  parseDocsManifest,
} from "@repo/next-config/docs-zone";
import { env } from "@/env";

/** How often the sitemap and llms.txt read the docs site again, in seconds. */
export const DOCS_MANIFEST_REVALIDATE = 3600;

/**
 * The docs site's manifest (its sitemap entries and sections) when
 * DOCS_ZONE_URL is set; null when this app serves its own copy of the docs.
 *
 * Fetched with an hourly revalidate, which makes the route that calls it
 * regenerate hourly too. A failed fetch throws: a regeneration that throws
 * keeps the last good copy, and a build that throws keeps the deployment
 * that's live.
 */
export async function docsZoneManifest(
  zone: string | undefined = env.DOCS_ZONE_URL,
): Promise<DocsManifest | null> {
  if (!zone) return null;
  const url = new URL(DOCS_MANIFEST_PATH, zone);
  const response = await fetch(url, {
    next: { revalidate: DOCS_MANIFEST_REVALIDATE },
  });
  if (!response.ok) {
    throw new Error(
      `Docs manifest: ${url.origin}${DOCS_MANIFEST_PATH} answered ${response.status}`,
    );
  }
  return parseDocsManifest(await response.json());
}

// Who built a catalog entry. QRdx's own integrations omit `publisher`;
// community integrations (OAuth apps other developers build and get listed,
// see apps/docs/content/docs/developers/build-an-integration.mdx) set
// `publisher: "community"` and their maker in `builtBy`. Client-safe.
import type { CatalogPublisher, IntegrationCatalogEntry } from "./types";

export const CATALOG_PUBLISHER_LABELS: Record<CatalogPublisher, string> = {
  qrdx: "Built by QRdx",
  community: "Community",
};

export function getCatalogPublisher(
  entry: Pick<IntegrationCatalogEntry, "publisher">
): CatalogPublisher {
  return entry.publisher ?? "qrdx";
}

/** Gets the "Community" badge: built by someone other than QRdx. */
export function isCommunityEntry(
  entry: Pick<IntegrationCatalogEntry, "publisher">
): boolean {
  return getCatalogPublisher(entry) === "community";
}

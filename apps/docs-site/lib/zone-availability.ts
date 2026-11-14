// What the main app offers, as the docs site knows it: the main app's
// /zone/availability.json (PUBLISHED_AVAILABILITY_PATH in @repo/availability),
// fetched when the docs build starts (scripts/zone-inputs.mjs). Pure, so the
// tests pass in their own copies.
import {
  FEATURE_IDS,
  type FeatureId,
  type FeatureMap,
  isPathShown,
  type PublishedAvailability,
  toPublicAvailability,
} from "@repo/availability";

/** The file scripts/zone-inputs.mjs writes (generated/zone-availability.json). */
export interface ZoneAvailabilityFile {
  /** The URL it came from, or null when the fetch failed. */
  source: string | null;
  /** What the main app published; null when the fetch failed. */
  availability: PublishedAvailability | null;
}

export interface ZoneAvailability {
  features: FeatureMap;
  hiddenPaths: readonly string[];
  isIntegrationVisible: (slug: string) => boolean;
}

/**
 * The docs' view of the main app. A feature counts as offered only when the
 * main app lists it in `available`, so an id it doesn't know yet (older
 * rules) is unavailable. Without the file's data (the fetch failed in a
 * local or CI build) every gated feature, page and integration is treated
 * as unavailable: the docs leave out what they can't confirm.
 */
export function zoneAvailability(file: ZoneAvailabilityFile): ZoneAvailability {
  const published = file.availability;
  const features = Object.fromEntries(
    FEATURE_IDS.map((id) => [id, published?.available.includes(id) ?? false]),
  ) as FeatureMap;
  const hiddenPaths = [
    ...new Set([
      ...toPublicAvailability(features).hiddenPaths,
      ...(published?.hiddenPaths ?? []),
    ]),
  ];
  const hiddenIntegrations = new Set(published?.hiddenIntegrations ?? []);
  return {
    features,
    hiddenPaths,
    isIntegrationVisible: (slug) =>
      published !== null && !hiddenIntegrations.has(slug),
  };
}

export type { FeatureId };
export { isPathShown };

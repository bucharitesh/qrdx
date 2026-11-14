import "server-only";

import zoneFile from "@/generated/zone-availability.json";
import type { FeatureId, FeatureMap } from "@/lib/feature-availability-rules";
import {
  isPathShown,
  type ZoneAvailabilityFile,
  zoneAvailability,
} from "@/lib/zone-availability";

// The main app's features, from its /zone/availability.json as fetched when
// this build started (lib/zone-availability.ts). The main app's version of
// this file reads its own environment; the docs site has none of those
// variables, so it asks the app. Fixed for the life of the build, like the
// main app's (a change shows with the next docs deploy).

const zone = zoneAvailability(zoneFile as ZoneAvailabilityFile);

/** True when `id` works on the main app. */
export function isFeatureAvailable(id: FeatureId): boolean {
  return zone.features[id];
}

/** Every feature's availability on the main app, by id. */
export function getFeatures(): FeatureMap {
  return zone.features;
}

/**
 * False for a link to a page that only offers an unavailable feature, like
 * a workspace's Domains page where custom domains can't be added.
 */
export function isPathAvailable(href: string): boolean {
  return isPathShown(zone.hiddenPaths, href);
}

/** True when the main app shows integration `slug`. */
export function isIntegrationVisible(slug: string): boolean {
  return zone.isIntegrationVisible(slug);
}

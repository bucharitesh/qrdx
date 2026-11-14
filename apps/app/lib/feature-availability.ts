import "server-only";

import { env } from "@/env";
import {
  type CustomDomainMode,
  computeFeatures,
  customDomainMode,
  type FeatureContext,
  type FeatureId,
  type FeatureMap,
  isPathShown,
  missingFeatureSetup,
  toPublicAvailability,
} from "@/lib/feature-availability-rules";

/**
 * The server environment as the feature rules read it (names only; values
 * never leave the server). Fixed for the life of the process, so pages that
 * are prerendered pick up a change on the next deploy.
 */
export function featureContext(): FeatureContext {
  return {
    // The app's variables and the packages' it extends: among them
    // BETTER_AUTH_URL (passkeys) and QRDX_EE_LICENSE (ee/ features) from
    // @repo/auth, and the app URL and VERCEL_PROJECT_PRODUCTION_URL (where
    // the affiliate program runs) from @repo/next-config.
    env: { ...(env as Readonly<Record<string, string | undefined>>) },
    onVercel: Boolean(process.env.VERCEL),
    production: process.env.NODE_ENV === "production",
  };
}

const features = computeFeatures(featureContext());

/** True when `id` can work on this deployment. */
export function isFeatureAvailable(id: FeatureId): boolean {
  return features[id];
}

/** The variable names `id` still needs here (admin and dev use only). */
export function featureSetupNeeded(id: FeatureId): string[] {
  return missingFeatureSetup(id, featureContext());
}

export function getCustomDomainMode(): CustomDomainMode {
  return customDomainMode(featureContext());
}

/** Every feature's availability here, by id. */
export function getFeatures(): FeatureMap {
  return features;
}

const hiddenPaths = toPublicAvailability(features).hiddenPaths;

/**
 * False for a link to a page that only offers an unavailable feature, like
 * a workspace's Domains page where custom domains can't be added.
 */
export function isPathAvailable(href: string): boolean {
  return isPathShown(hiddenPaths, href);
}

import "server-only";

import { env } from "@/lib/env";
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
    env: {
      ...(env as Readonly<Record<string, string | undefined>>),
      // Validated by @repo/next-config and Better Auth, not lib/env; passkeys
      // read them (feature-availability-rules.ts).
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      // The licence key for ee/ features (workspace SSO, the audit log), read the same way
      // by packages/auth/ee-license.ts.
      QRDX_EE_LICENSE: process.env.QRDX_EE_LICENSE,
      // The affiliate program's switch (feature-availability-rules.ts).
      QRDX_AFFILIATES: process.env.QRDX_AFFILIATES,
    },
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

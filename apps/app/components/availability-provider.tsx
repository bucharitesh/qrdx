"use client";

import {
  ALL_AVAILABLE,
  type FeatureId,
  isPathShown,
  type PublicAvailability,
} from "@repo/availability";
import { createContext, type ReactNode, useContext, useMemo } from "react";

// What this deployment offers, for client components: the root layout reads
// it on the server (lib/integration-availability.ts, getPublicAvailability)
// and passes ids, paths and slugs only. Without a provider, everything is
// offered.

const AvailabilityContext = createContext<PublicAvailability>(ALL_AVAILABLE);

export function AvailabilityProvider({
  value,
  children,
}: {
  value: PublicAvailability;
  children: ReactNode;
}) {
  return (
    <AvailabilityContext.Provider value={value}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export interface Availability {
  /** The feature can work here. */
  has: (feature: FeatureId) => boolean;
  /** False for a link to a page that only offers an unavailable feature. */
  showsPath: (href: string) => boolean;
  /** False for an integration hidden here (production and preview). */
  showsIntegration: (slug: string) => boolean;
}

export function useAvailability(): Availability {
  const value = useContext(AvailabilityContext);
  return useMemo(
    () => ({
      has: (feature) => !value.unavailable.includes(feature),
      showsPath: (href) => isPathShown(value.hiddenPaths, href),
      showsIntegration: (slug) => !value.hiddenIntegrations.includes(slug),
    }),
    [value],
  );
}

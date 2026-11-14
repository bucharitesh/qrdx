"use client";

import { DesignSystemProvider } from "@repo/design-system";
import type { ReactNode } from "react";
import { ConsentManager } from "@/components/consent/consent-manager";
import { useCspNonce } from "@/components/csp-nonce";
import { NavigationHistory } from "@/components/navigation-history";
import { SoundProvider } from "@/components/sound/sound-provider";

/** Toasts sit bottom right, at sonner's own offsets (the main app's Provider). */
export function Provider({ children }: { children: ReactNode }) {
  // next-themes' inline theme script needs the CSP nonce on nonce routes.
  const nonce = useCspNonce();
  return (
    <DesignSystemProvider nonce={nonce}>
      {children}
      {/* Pathnames of this tab's pages, in memory only (lib/analytics/funnel.ts reads them). */}
      <NavigationHistory />
      {/* Cookie banner + consent-gated PostHog/Featurebase, as on the main app's pages. */}
      <ConsentManager />
      {/* UI sounds (lib/sound): silent until a gesture. */}
      <SoundProvider />
    </DesignSystemProvider>
  );
}

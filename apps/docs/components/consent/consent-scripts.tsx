"use client";

import { useConsent, useHasConsentPolicy } from "@c15t/nextjs";
import FeaturebaseScript from "@/components/featurebase-script";
import { Analytics } from "@/lib/analytics/analytics";
import { env } from "@/lib/env";

/**
 * QRdx's own third-party tools. Analytics: Umami (cookieless) always runs,
 * PostHog only with the "Analytics" choice, which it follows live (see
 * lib/analytics). Featurebase loads in production after "Functionality" is
 * allowed. Revoking a category reloads the page (c15t default), so a tool
 * that already ran stops there.
 */
export function ConsentScripts() {
  const ready = useHasConsentPolicy();
  const measurement = useConsent("measurement");
  const functionality = useConsent("functionality");

  return (
    <>
      {/* null until the stored choice is known, so PostHog waits for it. */}
      <Analytics measurement={ready ? measurement : null} />
      {process.env.NODE_ENV === "production" &&
        functionality &&
        Boolean(env.NEXT_PUBLIC_FEATUREBASE_APP_ID) && <FeaturebaseScript />}
    </>
  );
}

"use client";

import { useConsent, useHasConsentPolicy } from "@c15t/nextjs";
import { Analytics, type GetAnalyticsPlan } from "../analytics";
import { FeaturebaseScript } from "../featurebase";
import { keys } from "../keys";

/**
 * QRdx's own third-party tools. Analytics: Umami (cookieless) always runs,
 * PostHog only with the "Analytics" choice, which it follows live (see
 * ../posthog.ts). Featurebase loads in production after "Functionality" is
 * allowed. Revoking a category reloads the page (c15t default), so a tool
 * that already ran stops there.
 */
export function ConsentScripts({ getPlan }: { getPlan?: GetAnalyticsPlan }) {
  const ready = useHasConsentPolicy();
  const measurement = useConsent("measurement");
  const functionality = useConsent("functionality");

  return (
    <>
      {/* null until the stored choice is known, so PostHog waits for it. */}
      <Analytics measurement={ready ? measurement : null} getPlan={getPlan} />
      {process.env.NODE_ENV === "production" &&
        functionality &&
        Boolean(keys().NEXT_PUBLIC_FEATUREBASE_APP_ID) && <FeaturebaseScript />}
    </>
  );
}

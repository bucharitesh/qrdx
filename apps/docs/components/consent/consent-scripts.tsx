"use client";

import { useConsent } from "@c15t/nextjs";
import FeaturebaseScript from "@/components/featurebase-script";
import { PostHogInit } from "@/components/posthog-init";
import { env } from "@/lib/env";

/**
 * QRdx's own third-party tools, loaded only after the visitor allows their
 * category (production only, as before). Revoking a category reloads the
 * page (c15t default), so a tool that already ran stops there.
 */
export function ConsentScripts() {
  const measurement = useConsent("measurement");
  const functionality = useConsent("functionality");

  if (process.env.NODE_ENV !== "production") return null;

  return (
    <>
      {measurement && <PostHogInit />}
      {functionality && Boolean(env.NEXT_PUBLIC_FEATUREBASE_APP_ID) && (
        <FeaturebaseScript />
      )}
    </>
  );
}

"use client";

import { useConsent, useHasConsentPolicy } from "@c15t/nextjs";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  captureReferralFromUrl,
  storeReferralCookie,
} from "@/lib/affiliates/referral-client";

/**
 * An affiliate link's code (/?ref=<code>, lib/affiliates/referral-client.ts):
 * kept in memory for this tab on every visit, and in the qrdx_ref cookie
 * only once the visitor has allowed Analytics. Renders nothing.
 */
export function ReferralCapture() {
  const offered = useAvailability().has("affiliates");
  const ready = useHasConsentPolicy();
  const measurement = useConsent("measurement");
  const pathname = usePathname();

  useEffect(() => {
    if (!offered) return;
    // Runs again on each page, so a code that arrives later is kept too.
    void pathname;
    const code = captureReferralFromUrl();
    if (code && ready && measurement) storeReferralCookie(code);
  }, [offered, ready, measurement, pathname]);

  return null;
}

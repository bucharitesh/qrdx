"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAvailability } from "@/components/availability-provider";
import { captureReferralFromUrl } from "@/lib/affiliates/referral-client";

/**
 * An affiliate link's code (/?ref=<code>, lib/affiliates/referral-client.ts),
 * kept in this tab's memory for the rest of the visit so a sign-up can carry
 * it. Nothing is written to the device: no cookie, no storage. Renders
 * nothing, and does nothing where the affiliate program is off.
 */
export function ReferralCapture() {
  const offered = useAvailability().has("affiliates");
  const pathname = usePathname();

  useEffect(() => {
    if (!offered) return;
    // Runs again on each page, so a code that arrives later is kept too.
    void pathname;
    captureReferralFromUrl();
  }, [offered, pathname]);

  return null;
}

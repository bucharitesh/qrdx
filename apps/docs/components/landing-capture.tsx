"use client";

import { useEffect } from "react";
import { captureLanding } from "@/lib/analytics/landing";

/**
 * How this tab's visit started (the referring site's host, campaign tags,
 * the first page), kept in memory only so a sign-up in the same visit can
 * carry it (lib/analytics/landing.ts). Nothing is written to the device, and
 * nothing is kept under Do Not Track or Global Privacy Control. Renders
 * nothing.
 */
export function LandingCapture() {
  useEffect(() => {
    captureLanding();
  }, []);
  return null;
}

"use client";

import { ConsentRoot } from "@c15t/nextjs";
import { consentConfig } from "./config";
import { ConsentScripts } from "./consent-scripts";
import { CookieBanner } from "./cookie-banner";
import { CookiePreferences } from "./cookie-preferences";

/**
 * c15t consent for QRdx's own pages. Rendered beside the page tree (not
 * around it) and only off customer pages, so hosted pages never get the
 * provider, banner or QRdx's tools.
 */
export function ConsentManager() {
  return (
    <ConsentRoot config={consentConfig}>
      <CookieBanner />
      <CookiePreferences />
      <ConsentScripts />
    </ConsentRoot>
  );
}

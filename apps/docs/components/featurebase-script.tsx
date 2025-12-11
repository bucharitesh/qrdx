/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
"use client";

import Script from "next/script";
import { env } from "@/lib/env";

const FeaturebaseScript = () => {
  const handleScriptLoad = () => {
    const win = window as any;

    // Initialize Featurebase if it doesn't exist
    if (typeof win.Featurebase !== "function") {
      win.Featurebase = (...args: any[]) => {
        (win.Featurebase.q = win.Featurebase.q || []).push(...args);
      };
    }

    // Boot Featurebase messenger with configuration
    win.Featurebase("boot", {
      appId: env.NEXT_PUBLIC_FEATUREBASE_APP_ID, // required
      email: "user@example.com", // optional, requires secure installation by default
      userId: "12345", // optional, requires secure installation by default
      createdAt: "2025-05-06T12:00:00Z", // optional
      theme: "light", // "light" or "dark"
      language: "en", // short code (e.g. "en", "de", etc.)
      // + feel free to add any more custom values about the user here
    });
  };

  return (
    <>
      {/* Load the Featurebase SDK */}
      <Script
        src="https://do.featurebase.app/js/sdk.js"
        id="featurebase-sdk"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
      />
    </>
  );
};

export default FeaturebaseScript;

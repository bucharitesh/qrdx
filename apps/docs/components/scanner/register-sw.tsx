"use client";

import { useEffect } from "react";

/**
 * Registers /scan-sw.js for this language's scanner only (scope /scan,
 * /hi/scan …: lib/scanner-app.ts), so the scanner opens offline after the
 * first visit and the installed app can receive shared images. Skipped in
 * development, where cached chunks would fight hot reloading.
 */
export function RegisterScannerServiceWorker({ scope }: { scope: string }) {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker
      .register("/scan-sw.js", { scope, updateViaCache: "none" })
      .catch((error) =>
        console.warn("Scanner offline support unavailable:", error),
      );
  }, [scope]);
  return null;
}

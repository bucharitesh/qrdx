"use client";

import { useEffect } from "react";

/**
 * Registers /scan-sw.js for the /scan scope only, so the scanner opens offline
 * after the first visit. Skipped in development, where cached chunks would
 * fight hot reloading.
 */
export function RegisterScannerServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker
      .register("/scan-sw.js", { scope: "/scan" })
      .catch((error) =>
        console.warn("Scanner offline support unavailable:", error),
      );
  }, []);
  return null;
}
